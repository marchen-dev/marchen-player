/**
 * 翻译资源下载：逐文件拉取、解压、校验、落盘。
 *
 * 文件在存储桶中是 gzip 压缩后的普通二进制；这里解压并按解压后的字节数汇报进度，
 * 与清单中的 SHA-256 一致后才写入本机。已存在且大小相符的文件直接跳过，
 * 因此重试只会补下缺失的部分。
 *
 * 大文件分段下载：按 8 MB 一段、几段并发，单独一段失败时只重试这一段。
 * 资源走的是跨境线路，大陆用户下载 44 MB 的主模型可能要几十秒到一分钟，
 * 时间越长越容易中途断开；整文件一个请求断了只能从头再来，分段则只损失一小段。
 * 小文件仍然一个请求取完。
 */
import type { TranslationAssetFile } from './manifest'
import type { TranslationAssetStore } from './store'
import { totalAssetSize, translationAssetUrl } from './manifest'

/** 稳定错误码：用于遥测 fingerprint 与界面状态，不随文案变化 */
export type TranslationAssetErrorCode =
  /** 请求发不出去或中途断开 */
  | 'assets_network'
  /** 服务器返回非 2xx */
  | 'assets_http'
  /** 解压失败，或解压后的大小、哈希与清单不一致 */
  | 'assets_integrity'
  /** 写入本机存储失败（空间不足等） */
  | 'assets_storage'
  /** 用户取消或流程被中止，属于预期情况，不作为异常上报 */
  | 'assets_aborted'

export class TranslationAssetError extends Error {
  constructor(
    readonly code: TranslationAssetErrorCode,
    message: string,
    options?: { cause?: unknown; file?: string; status?: number },
  ) {
    super(message, { cause: options?.cause })
    this.name = 'TranslationAssetError'
    this.file = options?.file
    this.status = options?.status
  }

  readonly file?: string
  readonly status?: number
}

export const isAssetAbort = (error: unknown): boolean =>
  error instanceof TranslationAssetError && error.code === 'assets_aborted'

/** 每段的字节数（压缩后）。超过这个大小的文件才分段 */
const SEGMENT_SIZE = 8 * 1024 * 1024
/** 同时下载的段数。再高收益不明显，还会挤占播放用的连接 */
const SEGMENT_CONCURRENCY = 3
/** 单段失败后的重试间隔（毫秒）；数组长度即重试次数 */
const SEGMENT_RETRY_DELAYS: readonly number[] = [500, 1500]

export interface EnsureAssetsOptions {
  base: string
  files: readonly TranslationAssetFile[]
  store: TranslationAssetStore
  signal?: AbortSignal
  /** loaded / total 均为解压后的字节数，已存在的文件计入 loaded */
  onProgress?: (loaded: number, total: number) => void
  fetchImpl?: typeof fetch
  /** 分段大小、并发数与重试间隔，仅测试时覆盖 */
  segmentSize?: number
  segmentConcurrency?: number
  segmentRetryDelays?: readonly number[]
}

interface TransferOptions {
  fetchImpl: typeof fetch
  signal: AbortSignal | undefined
  segmentSize: number
  segmentConcurrency: number
  segmentRetryDelays: readonly number[]
}

export interface EnsureAssetsResult {
  /** 本次实际下载的文件数；0 表示全部已在本机 */
  downloadedFiles: number
  /** 本次下载并落盘的字节数（解压后） */
  downloadedBytes: number
}

/** 找出本机缺失（不存在或大小不符）的文件 */
export async function findMissingAssets(
  files: readonly TranslationAssetFile[],
  store: TranslationAssetStore,
): Promise<TranslationAssetFile[]> {
  const present = await Promise.all(files.map((file) => store.has(file.name, file.size)))
  return files.filter((_, index) => !present[index])
}

export async function ensureTranslationAssets(
  options: EnsureAssetsOptions,
): Promise<EnsureAssetsResult> {
  const { base, files, store, signal, onProgress } = options
  const transfer: TransferOptions = {
    fetchImpl: options.fetchImpl ?? fetch,
    signal,
    segmentSize: options.segmentSize ?? SEGMENT_SIZE,
    segmentConcurrency: options.segmentConcurrency ?? SEGMENT_CONCURRENCY,
    segmentRetryDelays: options.segmentRetryDelays ?? SEGMENT_RETRY_DELAYS,
  }
  const total = totalAssetSize(files)
  const missing = await findMissingAssets(files, store)
  let loaded = total - totalAssetSize(missing)
  onProgress?.(loaded, total)

  let downloadedBytes = 0
  for (const file of missing) {
    throwIfAborted(signal)
    const settled = loaded
    const data = await downloadFile(transfer, translationAssetUrl(base, file), file, (n) =>
      onProgress?.(settled + n, total),
    )
    try {
      await store.write(file.name, data)
    } catch (error) {
      throw new TranslationAssetError('assets_storage', '翻译资源写入本机存储失败', {
        cause: error,
        file: file.name,
      })
    }
    loaded += file.size
    downloadedBytes += file.size
    onProgress?.(loaded, total)
  }
  return { downloadedFiles: missing.length, downloadedBytes }
}

async function downloadFile(
  transfer: TransferOptions,
  url: string,
  file: TranslationAssetFile,
  onBytes: (received: number) => void,
): Promise<ArrayBuffer> {
  const { signal } = transfer
  // 先问文件有多大：够大就分段并发，否则（或探测不到大小时）一个请求取完
  const compressedSize = await probeCompressedSize(transfer, url, file)
  let compressed: ReadableStream<Uint8Array> | null = null
  // 分段时进度按「已收到的压缩字节占比」折算，解压阶段不再重复汇报
  let reportWhileDecoding = true
  if (compressedSize !== null && compressedSize > transfer.segmentSize) {
    // 单段重试会让已收到的字节数回退，汇报时取历史最大值，界面上的进度只进不退
    let peak = 0
    const segments = await downloadSegments(transfer, url, file, compressedSize, (received) => {
      peak = Math.max(peak, received)
      onBytes(Math.floor((file.size * peak) / compressedSize))
    })
    if (segments) {
      compressed = streamOf(segments)
      reportWhileDecoding = false
    }
  }
  compressed ??= await requestWhole(transfer, url, file)

  // 预分配到清单声明的大小；解压结果超出即判定为不一致，避免异常响应撑爆内存
  const output = new Uint8Array(file.size)
  let received = 0
  // 读网络流出错与解压出错都会从同一个读取循环里抛出，由这里记下是不是网络那一侧的问题
  const source = { failed: false }
  try {
    const reader = (await decodeBody(compressed, source)).getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (received + value.byteLength > file.size) {
        await reader.cancel().catch(() => {})
        throw new TranslationAssetError('assets_integrity', '翻译资源大小与清单不一致', {
          file: file.name,
        })
      }
      output.set(value, received)
      received += value.byteLength
      if (reportWhileDecoding) onBytes(received)
    }
  } catch (error) {
    if (error instanceof TranslationAssetError) throw error
    if (signal?.aborted) throw toTransportError(error, signal, file)
    // 网络流读取失败按网络错误处理（可重试）；其余都是内容问题：gzip 数据损坏或被篡改
    throw source.failed
      ? toTransportError(error, signal, file)
      : new TranslationAssetError('assets_integrity', '翻译资源解压失败', {
          cause: error,
          file: file.name,
        })
  }

  if (received !== file.size) {
    throw new TranslationAssetError('assets_integrity', '翻译资源大小与清单不一致', {
      file: file.name,
    })
  }
  const digest = toHex(await crypto.subtle.digest('SHA-256', output))
  if (digest !== file.sha256) {
    throw new TranslationAssetError('assets_integrity', '翻译资源校验不一致', { file: file.name })
  }
  return output.buffer
}

/** 一个请求取完整个文件，返回响应体（未解压） */
async function requestWhole(
  { fetchImpl, signal }: TransferOptions,
  url: string,
  file: TranslationAssetFile,
): Promise<ReadableStream<Uint8Array>> {
  let response: Response
  try {
    // 不带凭据：页面是 COEP credentialless，资源桶只需允许跨域读取
    response = await fetchImpl(url, { mode: 'cors', credentials: 'omit', signal })
  } catch (error) {
    throw toTransportError(error, signal, file)
  }
  if (!response.ok || !response.body) throw httpError(response.status, file)
  return response.body
}

/**
 * 用 HEAD 取压缩文件的大小。拿不到（请求失败、没有 Content-Length）时返回 null，
 * 由调用方退回整文件下载；真正的错误留给随后的 GET 去暴露，这里不重复报错。
 */
async function probeCompressedSize(
  { fetchImpl, signal }: TransferOptions,
  url: string,
  file: TranslationAssetFile,
): Promise<number | null> {
  try {
    const response = await fetchImpl(url, {
      method: 'HEAD',
      mode: 'cors',
      credentials: 'omit',
      signal,
    })
    if (!response.ok) return null
    const size = Number(response.headers.get('content-length'))
    return Number.isSafeInteger(size) && size > 0 ? size : null
  } catch (error) {
    if (signal?.aborted) throw toTransportError(error, signal, file)
    return null
  }
}

/**
 * 按固定大小分段、几段并发地下载，返回按顺序排好的各段内容。
 * 单独一段因网络中断或服务器临时错误失败时，只重试这一段；重试用尽后才整体失败并取消其余各段。
 * 服务器不支持分段（对 Range 请求回了 200 整文件）时返回 null，由调用方退回整文件下载。
 */
async function downloadSegments(
  { fetchImpl, signal, segmentSize, segmentConcurrency, segmentRetryDelays }: TransferOptions,
  url: string,
  file: TranslationAssetFile,
  compressedSize: number,
  onReceived: (received: number) => void,
): Promise<Uint8Array[] | null> {
  const count = Math.ceil(compressedSize / segmentSize)
  const segments: Uint8Array[] = Array.from({ length: count })
  // 内部的取消信号：外部取消或任意一段失败时，让其余各段立刻停下
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()

  let next = 0
  let received = 0
  let rangeUnsupported = false

  /** 下载一段。失败时把这一段已计入的字节数退回去，保证重试后进度不会被重复累计 */
  const attemptSegment = async (index: number) => {
    const start = index * segmentSize
    const end = Math.min(start + segmentSize, compressedSize) - 1
    const expected = end - start + 1
    let offset = 0
    try {
      const response = await fetchImpl(url, {
        mode: 'cors',
        credentials: 'omit',
        signal: controller.signal,
        headers: { Range: `bytes=${start}-${end}` },
      })
      if (response.status === 200) {
        rangeUnsupported = true
        await response.body?.cancel().catch(() => {})
        throw new Error('range ignored')
      }
      if (response.status !== 206 || !response.body) throw httpError(response.status, file)
      const buffer = new Uint8Array(expected)
      const reader = response.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (offset + value.byteLength > expected) {
          await reader.cancel().catch(() => {})
          throw new TranslationAssetError('assets_integrity', '翻译资源分段大小不符', {
            file: file.name,
          })
        }
        buffer.set(value, offset)
        offset += value.byteLength
        received += value.byteLength
        onReceived(received)
      }
      // 连接提前断开时读流会正常结束但内容不足，按网络错误处理以便重试
      if (offset !== expected) throw new TypeError('segment truncated')
      segments[index] = buffer
    } catch (error) {
      received -= offset
      throw error
    }
  }

  /** 值得重试的失败：连接问题，或服务器的临时错误。取消、不支持分段、内容不符都不重试 */
  const isRetryable = (error: unknown) => {
    if (controller.signal.aborted || rangeUnsupported) return false
    if (error instanceof TranslationAssetError) {
      const status = error.status ?? 0
      return error.code === 'assets_http' && (status >= 500 || status === 408 || status === 429)
    }
    return true
  }

  const fetchSegment = async (index: number) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await attemptSegment(index)
        return
      } catch (error) {
        if (attempt >= segmentRetryDelays.length || !isRetryable(error)) throw error
        await delay(segmentRetryDelays[attempt], controller.signal)
      }
    }
  }

  const worker = async () => {
    while (next < count && !controller.signal.aborted) await fetchSegment(next++)
  }

  try {
    await Promise.all(Array.from({ length: Math.min(segmentConcurrency, count) }, worker))
  } catch (error) {
    abort()
    if (rangeUnsupported && !signal?.aborted) return null
    if (error instanceof TranslationAssetError) throw error
    throw toTransportError(error, signal, file)
  } finally {
    signal?.removeEventListener('abort', abort)
  }
  if (signal?.aborted) throw toTransportError(null, signal, file)
  return segments
}

/** 等待一段时间；期间被取消则立刻结束，由调用方随后的检查处理取消 */
const delay = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0 || signal.aborted) return resolve()
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })

const streamOf = (chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> => {
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++])
      else controller.close()
    },
  })
}

const httpError = (status: number, file: TranslationAssetFile) =>
  new TranslationAssetError('assets_http', `翻译资源下载失败（HTTP ${status}）`, {
    file: file.name,
    status,
  })

/**
 * 按内容判断是否需要解压：存储桶约定返回 gzip 文件本身，
 * 但若某条线路把它当作传输压缩透明解开了，拿到的已是原始内容，再解一次会失败。
 * 看前两个字节（gzip 魔数 0x1f 0x8b，即 31 与 139）即可区分，模型与 WASM 都不以这两个字节开头。
 */
async function decodeBody(
  body: ReadableStream<Uint8Array>,
  source: { failed: boolean },
): Promise<ReadableStream<Uint8Array>> {
  const reader = body.getReader()
  const read = async () => {
    try {
      return await reader.read()
    } catch (error) {
      source.failed = true
      throw error
    }
  }
  const first = await read()
  const head = first.value
  const rest = new ReadableStream<Uint8Array>({
    start(controller) {
      if (head) controller.enqueue(head)
      if (first.done) controller.close()
    },
    async pull(controller) {
      const { done, value } = await read()
      if (done) controller.close()
      else controller.enqueue(value)
    },
    cancel: (reason) => reader.cancel(reason),
  })
  const gzipped = head !== undefined && head.byteLength >= 2 && head[0] === 31 && head[1] === 139
  return gzipped
    ? rest.pipeThrough(
        new DecompressionStream('gzip') as ReadableWritablePair<Uint8Array, Uint8Array>,
      )
    : rest
}

const throwIfAborted = (signal: AbortSignal | undefined) => {
  if (signal?.aborted) throw new TranslationAssetError('assets_aborted', '翻译资源下载已取消')
}

const toTransportError = (
  error: unknown,
  signal: AbortSignal | undefined,
  file: TranslationAssetFile,
) =>
  signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')
    ? new TranslationAssetError('assets_aborted', '翻译资源下载已取消', { file: file.name })
    : new TranslationAssetError('assets_network', '翻译资源下载失败，请检查网络', {
        cause: error,
        file: file.name,
      })

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
