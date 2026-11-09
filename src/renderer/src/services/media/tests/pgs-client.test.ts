import type { PgsBitmapFrame, PgsWorkerReply, PgsWorkerRequest } from '../subtitles/pgs/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PgsWorkerClient } from '../subtitles/pgs/client'

/** 最小 Worker 替身：记录主线程发来的消息，测试里手动回消息 */
class FakeWorker {
  static last: FakeWorker
  sent: PgsWorkerRequest[] = []
  terminated = false
  onmessage?: (event: { data: PgsWorkerReply }) => void
  onerror?: (event: { message: string; preventDefault: () => void }) => void
  constructor() {
    FakeWorker.last = this
  }

  postMessage(message: PgsWorkerRequest) {
    this.sent.push(message)
  }

  terminate() {
    this.terminated = true
  }

  reply(data: PgsWorkerReply) {
    this.onmessage?.({ data })
  }
}

const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> }
const frame = (key: number): PgsBitmapFrame => ({
  key,
  start: key,
  end: key + 1,
  width: 1920,
  height: 1080,
  rects: [{ x: 0, y: 0, width: 1, height: 1, bitmap: bitmap() }],
})
const track = { number: 2, uid: '1', codec: 'S_HDMV/PGS' }
const source = { kind: 'url' as const, url: 'marchen://media/x' }

describe('字幕位图 Worker 客户端', () => {
  beforeEach(() => vi.stubGlobal('Worker', FakeWorker))
  afterEach(() => vi.unstubAllGlobals())

  it('打开成功后转发播放位置，跳转时提升代次', async () => {
    const client = new PgsWorkerClient({ frames: vi.fn(), error: vi.fn() })
    const opened = client.open(source, track)
    FakeWorker.last.reply({ type: 'ready', mode: 'index', hdr: true })
    expect(await opened).toEqual({ mode: 'index', hdr: true })
    client.update(10, true)
    client.update(60, true, true)
    expect(FakeWorker.last.sent.slice(1)).toEqual([
      { type: 'update', time: 10, generation: 0, playing: true },
      { type: 'update', time: 60, generation: 1, playing: true },
    ])
  })

  it('过期代次的位图直接释放，不交给消费者', async () => {
    const frames = vi.fn()
    const client = new PgsWorkerClient({ frames, error: vi.fn() })
    client.update(10, true, true)
    const stale = frame(1)
    FakeWorker.last.reply({ type: 'frames', generation: 0, frames: [stale], keep: [1], ends: [] })
    expect(frames).not.toHaveBeenCalled()
    expect(stale.rects[0].bitmap.close).toHaveBeenCalled()
    const current = frame(2)
    FakeWorker.last.reply({ type: 'frames', generation: 1, frames: [current], keep: [2], ends: [] })
    expect(frames).toHaveBeenCalledWith(1, [current], [2], [])
  })

  it('打开前的致命错误让 open 失败并终止 Worker', async () => {
    const client = new PgsWorkerClient({ frames: vi.fn(), error: vi.fn() })
    const opened = client.open(source, track)
    FakeWorker.last.reply({ type: 'error', code: 'read_failed', message: '读取失败', fatal: true })
    await expect(opened).rejects.toMatchObject({ code: 'read_failed', fatal: true })
    await vi.waitFor(() => expect(FakeWorker.last.terminated).toBe(true))
  })

  it('非致命错误只通知消费者', () => {
    const error = vi.fn()
    const client = new PgsWorkerClient({ frames: vi.fn(), error })
    FakeWorker.last.reply({ type: 'error', code: 'backtrack_exceeded', message: '超限', fatal: false })
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: 'backtrack_exceeded', fatal: false }))
    expect(client.currentGeneration).toBe(0)
  })

  it('关闭时取回统计；关闭后到达的位图被释放', async () => {
    const frames = vi.fn()
    const client = new PgsWorkerClient({ frames, error: vi.fn() })
    const closing = client.close()
    expect(FakeWorker.last.sent.at(-1)).toEqual({ type: 'close' })
    const late = frame(3)
    FakeWorker.last.reply({ type: 'frames', generation: 0, frames: [late], keep: [3], ends: [] })
    const stats = { readBytes: 10, maxBacktrack: 1, scanUsed: false, blockFailures: 0, decodeFailures: 0, hdr: false }
    FakeWorker.last.reply({ type: 'stats', stats })
    expect(await closing).toEqual(stats)
    expect(frames).not.toHaveBeenCalled()
    expect(late.rects[0].bitmap.close).toHaveBeenCalled()
    expect(FakeWorker.last.terminated).toBe(true)
  })

  it('worker 不回报统计时按超时终止', async () => {
    vi.useFakeTimers()
    try {
      const client = new PgsWorkerClient({ frames: vi.fn(), error: vi.fn() })
      const closing = client.close()
      await vi.advanceTimersByTimeAsync(600)
      expect(await closing).toBeUndefined()
      expect(FakeWorker.last.terminated).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
