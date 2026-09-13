import type { FrameRequest } from '../frame-tools'
import { describe, expect, it, vi } from 'vitest'
import { MediaFrameQueue } from '../frame-queue'

const source = {
  kind: 'web-file' as const,
  file: new File(['video'], 'a.mp4'),
  name: 'a.mp4',
  size: 5,
  hash: 'queue-test',
}
const harness = () => {
  const calls: Array<{ time: number; finish: (value: string) => void }> = []
  const capture = (request: FrameRequest) =>
    new Promise<string>((resolve, reject) => {
      calls.push({ time: request.time, finish: resolve })
      request.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('cancelled', 'AbortError')),
        { once: true },
      )
    })
  return { queue: new MediaFrameQueue(capture), calls }
}

describe('媒体取帧队列', () => {
  it('同一预览只接受最新目标，旧解码停止后才启动下一次', async () => {
    const { queue, calls } = harness()
    const old = queue.request('preview', { source, time: 1 }).catch((error) => error.name)
    const latest = queue.request('preview', { source, time: 2 })
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    calls[1].finish('latest')
    expect(await old).toBe('AbortError')
    expect(await latest).toBe('latest')
  })
  it('交互任务抢占后台缩略图，之后恢复后台请求', async () => {
    const { queue, calls } = harness()
    const background = queue.request('history', { source, time: 5 }, 0)
    const interactive = queue.request('preview', { source, time: 9 }, 1)
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    calls[1].finish('shot')
    expect(await interactive).toBe('shot')
    await vi.waitFor(() => expect(calls).toHaveLength(3))
    calls[2].finish('cover')
    expect(await background).toBe('cover')
    expect(calls.map((call) => call.time)).toEqual([5, 9, 5])
  })
})
