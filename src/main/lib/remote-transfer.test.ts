import type { RemoteRangeSource } from '@marchen/shared/media/remote'
import { describe, expect, it, vi } from 'vitest'
import { cacheRemotePrefix } from './remote-prefix-cache'
import { RemoteTransferMeter, trackRemoteTransfer } from './remote-transfer'

describe('远程播放流量统计', () => {
  it('速度在无流量后一秒归零，累计不会丢失', () => {
    let now = 0
    const meter = new RemoteTransferMeter(() => now)
    meter.add(1024)
    now = 250
    meter.add(2048)
    expect(meter.snapshot()).toEqual({ received: 3072, speed: 3072 })
    now = 1500
    expect(meter.snapshot()).toEqual({ received: 3072, speed: 0 })
  })
  it('不主动拉取，不复制 chunk，取消传递到上游', async () => {
    const pull = vi.fn()
    const cancel = vi.fn()
    const bytes = new Uint8Array([1, 2, 3])
    const source = {
      stream: async () =>
        new ReadableStream(
          {
            pull(c) {
              pull()
              c.enqueue(bytes)
            },
            cancel,
          },
          { highWaterMark: 0 },
        ),
    } as unknown as RemoteRangeSource
    const meter = new RemoteTransferMeter()
    const stream = await trackRemoteTransfer(source, meter).stream(0, 3)
    expect(pull).not.toHaveBeenCalled()
    const reader = stream.getReader()
    expect((await reader.read()).value).toBe(bytes)
    expect(meter.snapshot().received).toBe(3)
    await reader.cancel()
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('缓存命中不重复统计网络字节', async () => {
    const data = new Uint8Array([1, 2, 3])
    const source = {
      size: 3,
      name: 'test.mp4',
      url: 'https://example.com/test.mp4',
      read: vi.fn(),
      close: vi.fn(),
      stream: vi.fn(
        async () =>
          new ReadableStream({
            start(c) {
              c.enqueue(data)
              c.close()
            },
          }),
      ),
    } satisfies RemoteRangeSource
    const meter = new RemoteTransferMeter()
    const cached = cacheRemotePrefix(
      trackRemoteTransfer(source, meter),
      new AbortController().signal,
    )
    await new Response(await cached.stream(0, 3)).arrayBuffer()
    await new Response(await cached.stream(0, 3)).arrayBuffer()
    expect(meter.snapshot().received).toBe(3)
    expect(source.stream).toHaveBeenCalledOnce()
  })
})
