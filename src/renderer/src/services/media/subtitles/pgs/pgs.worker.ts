/// <reference lib="webworker" />
import type { SubtitleSource } from '../matroska'
import type { PgsLoaderFrame } from './loader'
import type { PgsBitmapFrame, PgsSessionErrorCode, PgsWorkerReply, PgsWorkerRequest } from './protocol'
import { SubtitleError } from '@marchen/shared/media'
import { openRangeSource } from '../../range-source'
import { MatroskaSubtitles } from '../matroska'
import { PgsWindowLoader } from './loader'

/**
 * PGS Worker：读取、解压、解析、合成都在这里完成，主线程只绘制 ImageBitmap。
 * 一个 Worker 对应一条字幕轨的一次会话；关闭时先回报统计再退出。
 */

let loader: PgsWindowLoader | undefined
let readBytes = 0
let hdr = false
let latestGeneration = -1
let closed = false
/** 位图转换是异步的；用队列保证批次按顺序送出 */
let queue: Promise<void> = Promise.resolve()
const opening = new AbortController()

const post = (reply: PgsWorkerReply, transfer: Transferable[] = []) =>
  globalThis.postMessage(reply, { transfer })

const fail = (code: PgsSessionErrorCode, error: unknown, fatal = true) =>
  post({ type: 'error', code, message: error instanceof Error ? error.message : String(error), fatal })

/** 平台来源：本地 / Electron 走授权租约 URL 的 Range 读取，Web 直接切片 File。统计实际读取的字节数 */
async function openSource(request: Extract<PgsWorkerRequest, { type: 'open' }>): Promise<SubtitleSource> {
  const descriptor = request.source
  const base: SubtitleSource =
    descriptor.kind === 'file'
      ? {
          size: descriptor.file.size,
          read: async (start, end, signal) => {
            signal?.throwIfAborted()
            return new Uint8Array(await descriptor.file.slice(start, end).arrayBuffer())
          },
        }
      : await openRangeSource(descriptor.url, opening.signal)
  return {
    size: base.size,
    read: async (start, end, signal) => {
      const bytes = await base.read(start, end, signal)
      readBytes += bytes.length
      return bytes
    },
  }
}

async function toBitmaps(frames: PgsLoaderFrame[]) {
  const output: PgsBitmapFrame[] = []
  const transfer: Transferable[] = []
  for (const { key, start, end, frame } of frames) {
    const rects: PgsBitmapFrame['rects'] = []
    for (const rect of frame.rects) {
      const bitmap = await createImageBitmap(new ImageData(rect.rgba as ImageDataArray, rect.width, rect.height))
      transfer.push(bitmap)
      rects.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, bitmap })
    }
    output.push({ key, start, end, width: frame.width, height: frame.height, rects })
  }
  return { output, transfer }
}

async function open(request: Extract<PgsWorkerRequest, { type: 'open' }>) {
  try {
    const source = await openSource(request)
    const reader = await MatroskaSubtitles.open(source, opening.signal)
    const track = reader.tracks.find((item) => item.number === request.track.number)
    if (!track || track.uid !== request.track.uid || track.codec !== request.track.codec)
      throw new SubtitleError('track_missing', '字幕轨信息已变化，请重新选择')
    if (!track.supported) throw new SubtitleError('unsupported_format', track.unsupportedReason ?? '暂不支持此字幕轨')
    const transfer = reader.video?.transfer
    hdr = transfer === 'pq' || transfer === 'hlg' || (transfer === undefined && Boolean(request.hdrHint))
    loader = new PgsWindowLoader(reader, track.number, { hdr }, {
      frames: (generation, frames, keep, ends) => {
        queue = queue.then(async () => {
          const { output, transfer } = await toBitmaps(frames)
          // 转换期间已经跳转或关闭：迟到的位图直接释放
          if (closed || generation < latestGeneration) {
            for (const frame of output) for (const rect of frame.rects) rect.bitmap.close()
            return
          }
          post({ type: 'frames', generation, frames: output, keep, ends }, transfer)
        }).catch((error) => fail('decode_failed', error, false))
      },
      error: (code, message, fatal) => post({ type: 'error', code, message, fatal }),
    })
    const mode = await loader.start(opening.signal)
    if (closed) return
    post({ type: 'ready', mode, hdr })
  } catch (error) {
    if (closed) return
    fail(classifyOpenError(error), error)
  }
}

/** 打开阶段的失败归类：容器结构问题算块损坏，其余（读取、轨道变化）算读取失败 */
function classifyOpenError(error: unknown): PgsSessionErrorCode {
  if (!(error instanceof SubtitleError)) return 'read_failed'
  if (error.reason === 'container_invalid' || error.reason === 'block_invalid') return 'block_invalid'
  return 'read_failed'
}

function close() {
  if (closed) return
  closed = true
  opening.abort()
  const stats = loader?.stats()
  loader?.close()
  post({
    type: 'stats',
    stats: {
      maxBacktrack: 0,
      scanUsed: false,
      blockFailures: 0,
      decodeFailures: 0,
      ...stats,
      readBytes,
      hdr,
    },
  })
  globalThis.close()
}

globalThis.onmessage = ({ data }: MessageEvent<PgsWorkerRequest>) => {
  if (closed) return
  if (data.type === 'open') void open(data)
  else if (data.type === 'update') {
    latestGeneration = Math.max(latestGeneration, data.generation)
    loader?.update(data.time, data.generation, data.playing)
  } else if (data.type === 'close') {
    close()
  }
}
