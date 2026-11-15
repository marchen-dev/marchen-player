import type { TranslationAssetFile } from '../assets/manifest'
import type { TranslationAssetStore } from '../assets/store'
import { createHash, randomBytes } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  ensureTranslationAssets,
  findMissingAssets,
  isAssetAbort,
  TranslationAssetError,
} from '../assets/download'

const BASE = 'https://assets.example.invalid/translation'

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

/** 生成一个内容可辨识的假资源文件及其清单项 */
const makeFile = (name: string, length: number, seed: number) => {
  const data = new Uint8Array(length).map((_, index) => (index * 31 + seed) & 255)
  const file: TranslationAssetFile = {
    kind: 'model',
    name,
    path: `models/${name}.gz`,
    size: length,
    sha256: sha256(data),
  }
  return { file, data }
}

const createMemoryStore = () => {
  const files = new Map<string, ArrayBuffer>()
  const store: TranslationAssetStore = {
    has: async (name, size) => files.get(name)?.byteLength === size,
    read: async (name) => files.get(name) ?? null,
    write: async (name, data) => void files.set(name, data),
    remove: async (name) => void files.delete(name),
    usage: async () => [...files.values()].reduce((sum, data) => sum + data.byteLength, 0),
    clear: async () => files.clear(),
  }
  return { store, files }
}

/** 按路径返回预置响应的假 fetch，并记录请求过的地址 */
const createFetch = (responses: Record<string, () => Response | Promise<Response>>) => {
  const requested: string[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    // 这个假服务器不回答 HEAD：探测不到大小，下载走「一个请求取完」的路径
    if (init?.method === 'HEAD') return new Response(null, { status: 405 })
    requested.push(url)
    const make = responses[url.slice(BASE.length + 1)]
    if (!make) return new Response(null, { status: 404 })
    return make()
  }) as typeof fetch
  return { fetchImpl, requested }
}

const gzipResponse = (data: Uint8Array) => () => new Response(gzipSync(data))

/** 支持 HEAD 与 Range 的假存储桶：按路径提供压缩后的文件内容，并记录每个请求 */
const createBucket = (
  files: Record<string, Uint8Array<ArrayBuffer>>,
  options: {
    ignoreRange?: boolean
    failRange?: (range: string) => boolean
    /** 返回要替换的响应（例如截断的内容、指定的状态码）；返回 undefined 则正常应答 */
    respond?: (range: string, attempt: number) => Response | 'network-error' | undefined
  } = {},
) => {
  const requests: Array<{ method: string; range?: string }> = []
  const attempts = new Map<string, number>()
  let active = 0
  let peak = 0
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = files[String(input).slice(BASE.length + 1)]
    const method = init?.method ?? 'GET'
    const range = new Headers(init?.headers).get('range') ?? undefined
    requests.push({ method, range })
    if (!body) return new Response(null, { status: 404 })
    if (method === 'HEAD') {
      return new Response(null, { headers: { 'content-length': String(body.byteLength) } })
    }
    if (!range || options.ignoreRange) return new Response(body)
    if (options.failRange?.(range)) return new Response(null, { status: 503 })
    const attempt = (attempts.get(range) ?? 0) + 1
    attempts.set(range, attempt)
    const custom = options.respond?.(range, attempt)
    if (custom === 'network-error') throw new TypeError('Failed to fetch')
    if (custom) return custom
    active += 1
    peak = Math.max(peak, active)
    // 让出一次事件循环，使并发的请求真正重叠
    await new Promise((resolve) => setTimeout(resolve, 1))
    active -= 1
    init?.signal?.throwIfAborted()
    const [start, end] = range.replace('bytes=', '').split('-').map(Number)
    return new Response(body.slice(start, end + 1), { status: 206 })
  }) as typeof fetch
  return { fetchImpl, requests, peak: () => peak }
}

/** 内容不可压缩的假文件：压缩后的大小与原始大小接近，便于按字节数分段 */
const makeLargeFile = (name: string, length: number) => {
  const data = new Uint8Array(randomBytes(length))
  const file: TranslationAssetFile = {
    kind: 'model',
    name,
    path: `models/${name}.gz`,
    size: length,
    sha256: sha256(data),
  }
  return { file, data, compressed: new Uint8Array(gzipSync(data)) }
}

describe('翻译资源下载', () => {
  it('下载、解压、校验通过后落盘，并按解压字节汇报进度', async () => {
    const a = makeFile('a.bin', 4096, 1)
    const b = makeFile('b.bin', 1024, 2)
    const { store, files } = createMemoryStore()
    const { fetchImpl } = createFetch({
      [a.file.path]: gzipResponse(a.data),
      [b.file.path]: gzipResponse(b.data),
    })
    const progress: Array<[number, number]> = []

    const result = await ensureTranslationAssets({
      base: BASE,
      files: [a.file, b.file],
      store,
      fetchImpl,
      onProgress: (loaded, total) => progress.push([loaded, total]),
    })

    expect(result).toEqual({ downloadedFiles: 2, downloadedBytes: 5120 })
    expect(new Uint8Array(files.get('a.bin')!)).toEqual(a.data)
    expect(new Uint8Array(files.get('b.bin')!)).toEqual(b.data)
    expect(progress[0]).toEqual([0, 5120])
    expect(progress.at(-1)).toEqual([5120, 5120])
    // 进度单调不减
    expect(
      progress.every(([loaded], index) => index === 0 || loaded >= progress[index - 1][0]),
    ).toBe(true)
  })

  it('已存在且大小相符的文件不再下载', async () => {
    const a = makeFile('a.bin', 2048, 3)
    const b = makeFile('b.bin', 512, 4)
    const { store } = createMemoryStore()
    await store.write('a.bin', a.data.buffer as ArrayBuffer)
    const { fetchImpl, requested } = createFetch({ [b.file.path]: gzipResponse(b.data) })
    const progress: number[] = []

    const result = await ensureTranslationAssets({
      base: BASE,
      files: [a.file, b.file],
      store,
      fetchImpl,
      onProgress: (loaded) => progress.push(loaded),
    })

    expect(result.downloadedFiles).toBe(1)
    expect(requested).toEqual([`${BASE}/${b.file.path}`])
    // 已有文件计入起始进度
    expect(progress[0]).toBe(2048)
  })

  it('大小不符的旧文件视为缺失', async () => {
    const a = makeFile('a.bin', 2048, 5)
    const { store } = createMemoryStore()
    await store.write('a.bin', new ArrayBuffer(100))
    expect(await findMissingAssets([a.file], store)).toEqual([a.file])
  })

  it('哈希不一致的文件被丢弃，不写入本机', async () => {
    const a = makeFile('a.bin', 1024, 6)
    const tampered = a.data.slice()
    tampered[10] ^= 255
    const { store, files } = createMemoryStore()
    const { fetchImpl } = createFetch({ [a.file.path]: gzipResponse(tampered) })

    const error = await ensureTranslationAssets({
      base: BASE,
      files: [a.file],
      store,
      fetchImpl,
    }).catch((reason) => reason)

    expect(error).toBeInstanceOf(TranslationAssetError)
    expect(error.code).toBe('assets_integrity')
    expect(files.has('a.bin')).toBe(false)
  })

  it('解压后比清单大或小都判定为不一致', async () => {
    const a = makeFile('a.bin', 1024, 7)
    for (const data of [new Uint8Array(2048), new Uint8Array(100)]) {
      const { store, files } = createMemoryStore()
      const { fetchImpl } = createFetch({ [a.file.path]: gzipResponse(data) })
      const error = await ensureTranslationAssets({
        base: BASE,
        files: [a.file],
        store,
        fetchImpl,
      }).catch((reason) => reason)
      expect(error.code).toBe('assets_integrity')
      expect(files.size).toBe(0)
    }
  })

  it('响应已被透明解压时按原始内容处理', async () => {
    const a = makeFile('a.bin', 1024, 8)
    const { store, files } = createMemoryStore()
    const { fetchImpl } = createFetch({ [a.file.path]: () => new Response(a.data) })

    await ensureTranslationAssets({ base: BASE, files: [a.file], store, fetchImpl })

    expect(new Uint8Array(files.get('a.bin')!)).toEqual(a.data)
  })

  it('中途失败后重试只补缺失的文件', async () => {
    const a = makeFile('a.bin', 1024, 9)
    const b = makeFile('b.bin', 1024, 10)
    const { store, files } = createMemoryStore()
    let failB = true
    const { fetchImpl, requested } = createFetch({
      [a.file.path]: gzipResponse(a.data),
      [b.file.path]: () =>
        failB ? new Response(null, { status: 503 }) : new Response(gzipSync(b.data)),
    })
    const run = () =>
      ensureTranslationAssets({ base: BASE, files: [a.file, b.file], store, fetchImpl })

    const error = await run().catch((reason) => reason)
    expect(error.code).toBe('assets_http')
    expect(error.status).toBe(503)
    expect(files.has('a.bin')).toBe(true)

    failB = false
    requested.length = 0
    const result = await run()
    expect(result.downloadedFiles).toBe(1)
    expect(requested).toEqual([`${BASE}/${b.file.path}`])
  })

  it('请求失败归为网络错误', async () => {
    const a = makeFile('a.bin', 64, 11)
    const { store } = createMemoryStore()
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    const error = await ensureTranslationAssets({
      base: BASE,
      files: [a.file],
      store,
      fetchImpl,
    }).catch((reason) => reason)
    expect(error.code).toBe('assets_network')
    expect(isAssetAbort(error)).toBe(false)
  })

  it('取消归为预期中止，不落盘', async () => {
    const a = makeFile('a.bin', 64, 12)
    const { store, files } = createMemoryStore()
    const controller = new AbortController()
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      controller.abort()
      init?.signal?.throwIfAborted()
      return new Response(gzipSync(a.data))
    }) as typeof fetch

    const error = await ensureTranslationAssets({
      base: BASE,
      files: [a.file],
      store,
      fetchImpl,
      signal: controller.signal,
    }).catch((reason) => reason)

    expect(isAssetAbort(error)).toBe(true)
    expect(files.size).toBe(0)
  })

  it('写入本机失败归为存储错误', async () => {
    const a = makeFile('a.bin', 64, 13)
    const { store } = createMemoryStore()
    store.write = async () => {
      throw new DOMException('quota', 'QuotaExceededError')
    }
    const { fetchImpl } = createFetch({ [a.file.path]: gzipResponse(a.data) })
    const error = await ensureTranslationAssets({
      base: BASE,
      files: [a.file],
      store,
      fetchImpl,
    }).catch((reason) => reason)
    expect(error.code).toBe('assets_storage')
  })

  describe('大文件分段下载', () => {
    it('超过分段大小的文件按 Range 并发下载，按顺序拼接后校验通过', async () => {
      const large = makeLargeFile('large.bin', 10_000)
      const { store, files } = createMemoryStore()
      const bucket = createBucket({ [large.file.path]: large.compressed })
      const progress: number[] = []

      const result = await ensureTranslationAssets({
        base: BASE,
        files: [large.file],
        store,
        fetchImpl: bucket.fetchImpl,
        segmentSize: 1024,
        segmentConcurrency: 3,
        onProgress: (loaded) => progress.push(loaded),
      })

      expect(result.downloadedBytes).toBe(10_000)
      expect(new Uint8Array(files.get('large.bin')!)).toEqual(large.data)
      const ranges = bucket.requests
        .filter((request) => request.range)
        .map((request) => request.range)
      const expected = Math.ceil(large.compressed.byteLength / 1024)
      expect(ranges).toHaveLength(expected)
      expect(ranges[0]).toBe('bytes=0-1023')
      // 最后一段只到文件末尾，不越界
      expect(ranges.at(-1)).toBe(
        `bytes=${(expected - 1) * 1024}-${large.compressed.byteLength - 1}`,
      )
      // 只有探测大小的 HEAD 与各段 GET，没有整文件请求
      expect(
        bucket.requests.filter((request) => request.method === 'GET' && !request.range),
      ).toEqual([])
      expect(bucket.peak()).toBeLessThanOrEqual(3)
      expect(bucket.peak()).toBeGreaterThan(1)
      // 进度单调不减，结束时等于总量
      expect(progress.every((value, index) => index === 0 || value >= progress[index - 1])).toBe(
        true,
      )
      expect(progress.at(-1)).toBe(10_000)
    })

    it('不超过分段大小的文件仍然一个请求取完', async () => {
      const small = makeLargeFile('small.bin', 500)
      const { store, files } = createMemoryStore()
      const bucket = createBucket({ [small.file.path]: small.compressed })

      await ensureTranslationAssets({
        base: BASE,
        files: [small.file],
        store,
        fetchImpl: bucket.fetchImpl,
        segmentSize: 1024,
      })

      expect(new Uint8Array(files.get('small.bin')!)).toEqual(small.data)
      expect(bucket.requests).toEqual([{ method: 'HEAD' }, { method: 'GET' }])
    })

    it('服务器不支持分段时退回整文件下载', async () => {
      const large = makeLargeFile('large.bin', 6000)
      const { store, files } = createMemoryStore()
      const bucket = createBucket({ [large.file.path]: large.compressed }, { ignoreRange: true })

      await ensureTranslationAssets({
        base: BASE,
        files: [large.file],
        store,
        fetchImpl: bucket.fetchImpl,
        segmentSize: 1024,
      })

      expect(new Uint8Array(files.get('large.bin')!)).toEqual(large.data)
      expect(bucket.requests.at(-1)).toEqual({ method: 'GET' })
    })

    it('单段临时失败时只重试这一段，成功后整个文件照常完成', async () => {
      const large = makeLargeFile('large.bin', 8000)
      const { store, files } = createMemoryStore()
      const bucket = createBucket(
        { [large.file.path]: large.compressed },
        {
          respond: (range, attempt) => {
            // 第 2 段第一次断网、第二次 503，第三次才成功；第 4 段第一次只回一半内容
            if (range.startsWith('bytes=1024-')) {
              if (attempt === 1) return 'network-error'
              if (attempt === 2) return new Response(null, { status: 503 })
            }
            if (range.startsWith('bytes=3072-') && attempt === 1) {
              return new Response(large.compressed.slice(3072, 3500), { status: 206 })
            }
            return undefined
          },
        },
      )
      const progress: number[] = []

      await ensureTranslationAssets({
        base: BASE,
        files: [large.file],
        store,
        fetchImpl: bucket.fetchImpl,
        segmentSize: 1024,
        segmentRetryDelays: [0, 0],
        onProgress: (loaded) => progress.push(loaded),
      })

      expect(new Uint8Array(files.get('large.bin')!)).toEqual(large.data)
      const count = (prefix: string) =>
        bucket.requests.filter((request) => request.range?.startsWith(prefix)).length
      expect(count('bytes=1024-')).toBe(3)
      expect(count('bytes=3072-')).toBe(2)
      // 其他段没有被重新下载
      expect(count('bytes=0-')).toBe(1)
      expect(count('bytes=2048-')).toBe(1)
      // 重试期间进度只进不退，结束时等于总量
      expect(progress.every((value, index) => index === 0 || value >= progress[index - 1])).toBe(
        true,
      )
      expect(progress.at(-1)).toBe(8000)
    })

    it('单段重试用尽后整个文件失败，不写入本机', async () => {
      const large = makeLargeFile('large.bin', 8000)
      const { store, files } = createMemoryStore()
      const bucket = createBucket(
        { [large.file.path]: large.compressed },
        { failRange: (range) => range.startsWith('bytes=2048-') },
      )

      const error = await ensureTranslationAssets({
        base: BASE,
        files: [large.file],
        store,
        fetchImpl: bucket.fetchImpl,
        segmentSize: 1024,
        segmentRetryDelays: [0, 0],
      }).catch((reason) => reason)

      expect(error).toBeInstanceOf(TranslationAssetError)
      expect(error.code).toBe('assets_http')
      expect(error.status).toBe(503)
      expect(files.size).toBe(0)
      // 首次加两次重试
      expect(
        bucket.requests.filter((request) => request.range?.startsWith('bytes=2048-')),
      ).toHaveLength(3)
    })

    it('明确的客户端错误不重试', async () => {
      const large = makeLargeFile('large.bin', 8000)
      const { store } = createMemoryStore()
      const bucket = createBucket(
        { [large.file.path]: large.compressed },
        {
          respond: (range) =>
            range.startsWith('bytes=1024-') ? new Response(null, { status: 403 }) : undefined,
        },
      )

      const error = await ensureTranslationAssets({
        base: BASE,
        files: [large.file],
        store,
        fetchImpl: bucket.fetchImpl,
        segmentSize: 1024,
        segmentRetryDelays: [0, 0],
      }).catch((reason) => reason)

      expect(error.code).toBe('assets_http')
      expect(error.status).toBe(403)
      expect(
        bucket.requests.filter((request) => request.range?.startsWith('bytes=1024-')),
      ).toHaveLength(1)
    })

    it('分段内容被篡改时校验失败', async () => {
      const large = makeLargeFile('large.bin', 8000)
      const tampered = large.compressed.slice()
      // 改动压缩流中段的一个字节：解压失败或解压结果的哈希不符
      tampered[3000] ^= 255
      const { store, files } = createMemoryStore()
      const bucket = createBucket({ [large.file.path]: tampered })

      const error = await ensureTranslationAssets({
        base: BASE,
        files: [large.file],
        store,
        fetchImpl: bucket.fetchImpl,
        segmentSize: 1024,
      }).catch((reason) => reason)

      expect(error.code).toBe('assets_integrity')
      expect(files.size).toBe(0)
    })

    it('分段下载途中取消归为预期中止', async () => {
      const large = makeLargeFile('large.bin', 8000)
      const { store, files } = createMemoryStore()
      const controller = new AbortController()
      const bucket = createBucket(
        { [large.file.path]: large.compressed },
        {
          failRange: (range) => {
            if (range.startsWith('bytes=1024-')) controller.abort()
            return false
          },
        },
      )

      const error = await ensureTranslationAssets({
        base: BASE,
        files: [large.file],
        store,
        fetchImpl: bucket.fetchImpl,
        segmentSize: 1024,
        signal: controller.signal,
      }).catch((reason) => reason)

      expect(isAssetAbort(error)).toBe(true)
      expect(files.size).toBe(0)
    })
  })
})
