import type { WebContents } from 'electron'
import { EventEmitter } from 'node:events'
import { openRemoteRangeSource, validateRemoteUrl } from '@marchen/shared/media/remote'
import { describe, expect, it, vi } from 'vitest'
import { createApplicationProtocol, createRemoteMediaLease } from './media-protocol'
import { fetchRemoteMedia } from './remote-media'
const data = new Uint8Array(1024)
const rangeFetch = () =>
  vi.fn<typeof fetch>(async (_url, options) => {
    const match = new Headers(options?.headers).get('Range')!.match(/bytes=(\d+)-(\d+)/)!
    const start = Number(match[1])
    const end = Number(match[2])
    return new Response(data.slice(start, end + 1), {
      status: 206,
      headers: { 'Content-Range': `bytes ${start}-${end}/1024` },
    })
  })

describe('远程范围读取', () => {
  it('不依赖 HEAD 和 ETag，读取任意合法范围', async () => {
    const fetcher = rangeFetch()
    const source = await openRemoteRangeSource(
      'https://example.com/download?signature=secret',
      undefined,
      fetcher,
    )
    expect(source.size).toBe(1024)
    expect((await source.read(512, 600)).length).toBe(88)
    expect(
      fetcher.mock.calls.every(
        ([, options]) => !options?.method && options?.credentials === 'omit',
      ),
    ).toBe(true)
    source.close()
    await expect(source.read(0, 1)).rejects.toBeDefined()
  })
  it.each([
    'file:///secret',
    'ftp://example.com/video',
    'https://user:password@example.com/v',
    'https://example.com/a.m3u8',
  ])('拒绝不支持的地址 %s', (url) => {
    expect(() => validateRemoteUrl(url)).toThrow()
  })
  it('服务端忽略 Range 时取消响应体，不读取整片', async () => {
    const cancel = vi.fn()
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(new ReadableStream({ cancel }), { status: 200 }),
    )
    await expect(
      openRemoteRangeSource('http://example.com/video', undefined, fetcher),
    ).rejects.toThrow('不支持按需读取')
    expect(cancel).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it.each(['bytes 0-0/*', 'bytes 1-1/1000', 'bad'])('拒绝无效范围 %s', async (range) => {
    await expect(
      openRemoteRangeSource(
        'http://example.com/video',
        undefined,
        async () =>
          new Response(new Uint8Array(1), { status: 206, headers: { 'Content-Range': range } }),
      ),
    ).rejects.toThrow('范围信息')
  })
  it('拒绝短读和超量响应', async () => {
    for (const length of [0, 2])
      await expect(
        openRemoteRangeSource(
          'http://example.com/video',
          undefined,
          async () =>
            new Response(new Uint8Array(length), {
              status: 206,
              headers: { 'Content-Range': 'bytes 0-0/1024' },
            }),
        ),
      ).rejects.toThrow()
  })
  it('读取期间的取消传递给 fetch', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>(
      async (_url, options) =>
        new Promise<Response>((_resolve, reject) =>
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason)),
        ),
    )
    const result = openRemoteRangeSource('http://example.com/video', controller.signal, fetcher)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled())
    controller.abort()
    await expect(result).rejects.toBeDefined()
  })
  it('403 不反复重试，普通错误不含原始凭证', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 403 }))
    await expect(
      openRemoteRangeSource('https://example.com/secret?token=abc', undefined, fetcher),
    ).rejects.toThrow('无法访问')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('瞬时失败最多重试两次，耗尽后停止', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError('offline')
    })
    await expect(
      openRemoteRangeSource('https://example.com/v', undefined, fetcher),
    ).rejects.toThrow('视频读取失败')
    expect(fetcher).toHaveBeenCalledTimes(3)
    const recovered = rangeFetch().mockRejectedValueOnce(new TypeError('temporary'))
    const source = await openRemoteRangeSource('https://example.com/v', undefined, recovered)
    expect(recovered).toHaveBeenCalledTimes(3)
    source.close()
  })
  it('读取时核对强 ETag，变化后不返回错误内容', async () => {
    const base = rangeFetch()
    let version = '"first"'
    const fetcher: typeof fetch = async (url, options) => {
      const response = await base(url, options)
      response.headers.set('ETag', version)
      return response
    }
    const source = await openRemoteRangeSource('https://example.com/v', undefined, fetcher)
    version = '"second"'
    await expect(source.read(10, 20)).rejects.toThrow('内容已变化')
    expect(new Headers(base.mock.calls.at(-1)?.[1]?.headers).get('If-Match')).toBe('"first"')
    source.close()
  })
  it('同时最多两个读取，取消会清理排队中的读取', async () => {
    const fetcher = rangeFetch()
    const source = await openRemoteRangeSource('https://example.com/v', undefined, fetcher)
    fetcher.mockImplementation(
      async (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
            once: true,
          })
        }),
    )
    const requests = Promise.allSettled([
      source.read(0, 10),
      source.read(10, 20),
      source.read(20, 30),
    ])
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4))
    source.close()
    expect((await requests).every((result) => result.status === 'rejected')).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })
})

describe('桌面远程媒体租约', () => {
  it('应用窗口导航撤销租约，外部窗口不能创建', async () => {
    const owner = Object.assign(new EventEmitter(), {
      id: 911,
      isDestroyed: () => false,
      getURL: (): string => 'marchen://app/index.html',
    })
    vi.stubGlobal('fetch', rangeFetch())
    try {
      const lease = await createRemoteMediaLease(
        'https://example.com/video',
        crypto.randomUUID(),
        owner as unknown as WebContents,
      )
      const handle = createApplicationProtocol('/tmp')
      const response = await handle(new Request(lease.url, { headers: { Range: 'bytes=10-19' } }))
      expect(response.status).toBe(206)
      expect((await response.arrayBuffer()).byteLength).toBe(10)
      owner.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
      expect((await handle(new Request(lease.url))).status).toBe(404)
      owner.getURL = () => 'https://untrusted.example.com'
      await expect(
        createRemoteMediaLease(
          'https://example.com/video',
          crypto.randomUUID(),
          owner as unknown as WebContents,
        ),
      ).rejects.toThrow('来源无效')
    } finally {
      owner.emit('destroyed')
      vi.unstubAllGlobals()
    }
  })
  it('逐跳拒绝非法协议并限制重定向次数', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 302, headers: { Location: 'file:///secret' } }),
    )
    vi.stubGlobal('fetch', fetcher)
    try {
      await expect(fetchRemoteMedia('https://example.com/video')).rejects.toThrow('仅支持')
      fetcher
        .mockClear()
        .mockImplementation(
          async () => new Response(null, { status: 302, headers: { Location: '/again' } }),
        )
      await expect(fetchRemoteMedia('https://example.com/video')).rejects.toThrow('重定向失败')
      expect(fetcher).toHaveBeenCalledTimes(6)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('远程响应流', () => {
  it('响应头和首批字节不用等待整个范围下载，持续进度超过 15 秒仍可继续', async () => {
    vi.useFakeTimers()
    const fetcher = rangeFetch()
    const source = await openRemoteRangeSource('https://example.com/video', undefined, fetcher)
    let body!: ReadableStreamDefaultController<Uint8Array>
    fetcher.mockImplementationOnce(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              body = controller
            },
          }),
          { status: 206, headers: { 'Content-Range': 'bytes 0-1023/1024' } },
        ),
    )
    try {
      const stream = await source.stream(0, 1024)
      const reader = stream.getReader()
      for (let i = 0; i < 8; i++) {
        const next = reader.read()
        await vi.advanceTimersByTimeAsync(2500)
        body.enqueue(new Uint8Array(128))
        expect((await next).value?.length).toBe(128)
      }
      body.close()
      expect((await reader.read()).done).toBe(true)
    } finally {
      source.close()
      vi.useRealTimers()
    }
  })
  it('下游取消立即取消上游并归还并发名额', async () => {
    const fetcher = rangeFetch()
    const source = await openRemoteRangeSource('https://example.com/video', undefined, fetcher)
    const cancel = vi.fn()
    let signal: AbortSignal | null | undefined
    fetcher.mockImplementationOnce(async (_url, options) => {
      signal = options?.signal
      return new Response(new ReadableStream({ cancel }), {
        status: 206,
        headers: { 'Content-Range': 'bytes 0-1023/1024' },
      })
    })
    const stream = await source.stream(0, 1024)
    await stream.cancel()
    expect(signal?.aborted).toBe(true)
    expect(cancel).toHaveBeenCalledOnce()
    expect((await source.read(0, 1)).length).toBe(1)
    source.close()
  })
  it.each([0, 2])('流式响应同样拒绝错误长度 %s', async (length) => {
    const fetcher = rangeFetch()
    const source = await openRemoteRangeSource('https://example.com/video', undefined, fetcher)
    fetcher.mockImplementationOnce(
      async () =>
        new Response(new Uint8Array(length), {
          status: 206,
          headers: { 'Content-Range': 'bytes 0-0/1024' },
        }),
    )
    const stream = await source.stream(0, 1)
    await expect(new Response(stream).arrayBuffer()).rejects.toBeDefined()
    source.close()
  })
})

it('流式读取停滞时中止上游，后续读取不占用失效流的名额', async () => {
  vi.useFakeTimers()
  const fetcher = rangeFetch()
  const source = await openRemoteRangeSource('https://example.com/video', undefined, fetcher)
  const cancel = vi.fn()
  fetcher.mockImplementationOnce(
    async () =>
      new Response(new ReadableStream({ cancel }), {
        status: 206,
        headers: { 'Content-Range': 'bytes 0-1023/1024' },
      }),
  )
  try {
    const stream = await source.stream(0, 1024)
    const pending = stream.getReader().read()
    const rejected = expect(pending).rejects.toThrow('视频读取已中断')
    await vi.advanceTimersByTimeAsync(15_000)
    await rejected
    expect(cancel).toHaveBeenCalledOnce()
    expect((await source.read(0, 1)).length).toBe(1)
  } finally {
    source.close()
    vi.useRealTimers()
  }
})

it('协议响应跨过内部 32 MiB 窗口仍保持完整范围，不提前报告 EOF', async () => {
  const size = 33 * 1024 * 1024
  const owner = Object.assign(new EventEmitter(), {
    id: 912,
    isDestroyed: () => false,
    getURL: () => 'marchen://app/index.html',
  })
  const ranges: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (_url, options) => {
      const range = new Headers(options?.headers).get('Range')!
      ranges.push(range)
      const match = range.match(/bytes=(\d+)-(\d+)/)!
      const start = Number(match[1]);
        const end = Number(match[2])
      let offset = start
      return new Response(
        new ReadableStream({
          pull(controller) {
            const length = Math.min(65536, end - offset + 1)
            if (!length) {
              controller.close()
              return
            }
            controller.enqueue(new Uint8Array(length))
            offset += length
          },
        }),
        { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/${size}` } },
      )
    }),
  )
  try {
    const lease = await createRemoteMediaLease(
      'https://example.com/video.mp4',
      crypto.randomUUID(),
      owner as unknown as WebContents,
    )
    const handle = createApplicationProtocol('/tmp')
    const response = await handle(new Request(lease.url, { headers: { Range: 'bytes=0-' } }))
    expect(response.headers.get('Content-Range')).toBe(`bytes 0-${size - 1}/${size}`)
    expect(response.headers.get('Content-Length')).toBe(String(size))
    let received = 0
    const reader = response.body!.getReader()
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      received += chunk.value.length
    }
    expect(received).toBe(size)
    expect(ranges.slice(-2)).toEqual(['bytes=0-33554431', `bytes=33554432-${size - 1}`])
    const suffix = await handle(new Request(lease.url, { headers: { Range: 'bytes=-10' } }))
    expect(suffix.headers.get('Content-Range')).toBe(`bytes ${size - 10}-${size - 1}/${size}`)
    expect((await suffix.arrayBuffer()).byteLength).toBe(10)
    const invalid = await handle(new Request(lease.url, { headers: { Range: 'invalid' } }))
    expect(invalid.status).toBe(416)
  } finally {
    owner.emit('destroyed')
    vi.unstubAllGlobals()
  }
})

it('有持续进度的缓冲读取不在 15 秒整体期限被重试', async () => {
  vi.useFakeTimers()
  const fetcher = rangeFetch()
  const source = await openRemoteRangeSource('https://example.com/video', undefined, fetcher)
  let body: ReadableStreamDefaultController<Uint8Array> | undefined
  fetcher.mockImplementationOnce(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            body = controller
          },
        }),
        { status: 206, headers: { 'Content-Range': 'bytes 0-1023/1024' } },
      ),
  )
  try {
    const reading = source.read(0, 1024)
    await vi.waitFor(() => expect(body).toBeDefined())
    for (let i = 0; i < 8; i++) {
      await vi.advanceTimersByTimeAsync(2500)
      body!.enqueue(new Uint8Array(128))
    }
    body!.close()
    expect((await reading).length).toBe(1024)
    expect(fetcher).toHaveBeenCalledTimes(3)
  } finally {
    source.close()
    vi.useRealTimers()
  }
})
