import type { RemoteRangeSource } from '@marchen/shared/media/remote'
import { describe, expect, it, vi } from 'vitest'
import { cacheRemotePrefix, REMOTE_PREFIX_SIZE, RemotePrefixBudget } from './remote-prefix-cache'

function fixture(size = 32) {
  const data = new Uint8Array(size).map((_, i) => i % 251)
  const source: RemoteRangeSource = {
    size,
    name: 'a.mkv',
    url: 'https://example.com/a',
    read: vi.fn(async (s, e) => data.slice(s, e)),
    stream: vi.fn(
      async (s, e) =>
        new ReadableStream({
          start(c) {
            c.enqueue(data.slice(s, e))
            c.close()
          },
        }),
    ),
    close: vi.fn(),
  }
  return { source, data, controller: new AbortController() }
}
const consume = async (stream: ReadableStream<Uint8Array<ArrayBuffer>>) =>
  new Uint8Array(await new Response(stream).arrayBuffer())

describe('远程租约识别前缀缓存', () => {
  it('完整识别后多个消费者复用前缀，返回相同字节', async () => {
    const f = fixture()
    const cached = cacheRemotePrefix(f.source, f.controller.signal)
    expect(await consume(await cached.stream(0, 32))).toEqual(f.data)
    await Promise.all(
      [0, 4, 20].map(async (s) => {
        expect(await consume(await cached.stream(s, 32))).toEqual(f.data.slice(s))
      }),
    )
    expect(f.source.stream).toHaveBeenCalledTimes(1)
    cached.close()
  })
  it('跨边界只拉取未缓存后缀，取消命中流不伤害其他消费者', async () => {
    const f = fixture(REMOTE_PREFIX_SIZE + 16)
    const cached = cacheRemotePrefix(f.source, f.controller.signal)
    await consume(await cached.stream(0, REMOTE_PREFIX_SIZE))
    await (await cached.stream(0, 8)).cancel()
    const start = REMOTE_PREFIX_SIZE - 4
    expect(await consume(await cached.stream(start, f.source.size))).toEqual(f.data.slice(start))
    expect(f.source.stream).toHaveBeenLastCalledWith(
      REMOTE_PREFIX_SIZE,
      f.source.size,
      expect.any(AbortSignal),
    )
    cached.close()
  })
  it('预算包括未读完的填充，取消或租约撤销归还预算', async () => {
    const budget = new RemotePrefixBudget(32)
    const a = fixture();
      const b = fixture()
    const first = cacheRemotePrefix(a.source, a.controller.signal, budget)
    const second = cacheRemotePrefix(b.source, b.controller.signal, budget)
    const pending = await first.stream(0, 32)
    await consume(await second.stream(0, 32))
    await consume(await second.stream(0, 32))
    expect(b.source.stream).toHaveBeenCalledTimes(2)
    await pending.cancel()
    await consume(await second.stream(0, 32))
    await consume(await second.stream(0, 32))
    expect(b.source.stream).toHaveBeenCalledTimes(3)
    b.controller.abort()
    await consume(await first.stream(0, 32))
    await consume(await first.stream(0, 32))
    expect(a.source.stream).toHaveBeenCalledTimes(2)
    first.close()
  })
  it('短读不能发布缓存，释放预算后允许重试', async () => {
    const f = fixture()
    const original = f.source.stream
    f.source.stream = vi
      .fn()
      .mockResolvedValueOnce(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(3))
            c.close()
          },
        }),
      )
      .mockImplementation(original)
    const cached = cacheRemotePrefix(f.source, f.controller.signal, new RemotePrefixBudget(32))
    await expect(consume(await cached.stream(0, 32))).rejects.toThrow('不完整')
    await consume(await cached.stream(0, 32))
    await consume(await cached.stream(0, 32))
    expect(f.source.stream).toHaveBeenCalledTimes(2)
    f.controller.abort()
    await expect(cached.stream(0, 32)).rejects.toThrow()
  })
})
