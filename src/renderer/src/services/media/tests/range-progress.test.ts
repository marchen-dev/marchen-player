import { afterEach, expect, it, vi } from 'vitest'
import { openRangeSource } from '../range-source'

afterEach(() => vi.unstubAllGlobals())
it('只读取原有 Range 响应，进度与收到字节一致', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, { headers: { 'Content-Length': '4', ETag: '"test"' } }),
    )
    .mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array([1, 2]))
            c.enqueue(new Uint8Array([3, 4]))
            c.close()
          },
        }),
        { status: 206, headers: { 'Content-Range': 'bytes 0-3/4', ETag: '"test"' } },
      ),
    )
  vi.stubGlobal('fetch', fetcher)
  const progress = vi.fn()
  const source = await openRangeSource('marchen://media/test', undefined, progress)
  expect(await source.read(0, 4)).toEqual(new Uint8Array([1, 2, 3, 4]))
  expect(progress.mock.calls).toEqual([
    [0, 4],
    [2, 4],
    [4, 4],
  ])
  expect(fetcher).toHaveBeenCalledTimes(2)
})
