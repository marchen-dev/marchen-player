import type { WithProvider } from './image-proxy'
import type { MediaSourceProvider } from './provider'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearSourceImages,
  handleSourceImage,
  IMAGE_LIMITS,
  sourceImageCacheBytes,
  sourceImageUrl,
} from './image-proxy'

const SOURCE = '7b0c8e7e-5c6a-4f55-9d0b-2f8a1f6e0001'

const provider: MediaSourceProvider = {
  origin: 'http://192.168.1.2:8096',
  authHeaders: () => ({ 'X-Emby-Token': 'tok' }),
  browse: vi.fn(),
  resolvePlayback: vi.fn(),
  siblings: vi.fn(),
  subtitles: vi.fn(),
  readSubtitle: vi.fn(),
  imageUrl: (itemId, kind, width, tag) =>
    `http://192.168.1.2:8096/Items/${itemId}/Images/${kind}?maxWidth=${width}&tag=${tag}`,
}

const use: WithProvider = async (_id, action) => action(provider)

const image = (size = 10, type = 'image/jpeg') =>
  new Response(new Uint8Array(size), { headers: { 'Content-Type': type } })

afterEach(() => {
  clearSourceImages()
  vi.unstubAllGlobals()
})

describe('海报代理', () => {
  it('地址宽度分档', () => {
    expect(sourceImageUrl(SOURCE, 'item', 'Primary', 200, 'tag')).toBe(
      `marchen://source-image/${SOURCE}/item/Primary?w=320&tag=tag`,
    )
    expect(sourceImageUrl(SOURCE, 'item', 'Primary', 2000, 't')).toContain('w=640')
  })

  it.each([
    `/not-a-uuid/item/Primary?w=320`,
    `/${SOURCE}/item/Logo?w=320`,
    `/${SOURCE}/item/Primary?w=333`,
    `/${SOURCE}/../etc/Primary?w=320`,
    `/${SOURCE}/item/Primary/extra?w=320`,
  ])('拒绝非法参数：%s', async (path) => {
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    const response = await handleSourceImage(new URL(`marchen://source-image${path}`), use)
    expect(response.status).toBe(404)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('带鉴权取图并缓存，第二次不再请求上游', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => image())
    vi.stubGlobal('fetch', fetcher)
    const url = new URL(sourceImageUrl(SOURCE, 'item', 'Primary', 320, 'a'))
    const first = await handleSourceImage(url, use)
    expect(first.status).toBe(200)
    expect(first.headers.get('Content-Type')).toBe('image/jpeg')
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('X-Emby-Token')).toBe('tok')
    await handleSourceImage(url, use)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('非图片响应与上游失败返回 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => image(10, 'text/html')),
    )
    expect(
      (await handleSourceImage(new URL(sourceImageUrl(SOURCE, 'a', 'Primary', 320, 't')), use))
        .status,
    ).toBe(404)
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => new Response(null, { status: 500 })),
    )
    expect(
      (await handleSourceImage(new URL(sourceImageUrl(SOURCE, 'b', 'Primary', 320, 't')), use))
        .status,
    ).toBe(404)
  })

  it('超过总量时淘汰最久未用的缓存；按来源清除', async () => {
    const big = IMAGE_LIMITS.cache / 4
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => image(big)),
    )
    for (const id of ['a', 'b', 'c', 'd', 'e'])
      await handleSourceImage(new URL(sourceImageUrl(SOURCE, id, 'Primary', 320, 't')), use)
    expect(sourceImageCacheBytes()).toBeLessThanOrEqual(IMAGE_LIMITS.cache)
    clearSourceImages(SOURCE)
    expect(sourceImageCacheBytes()).toBe(0)
  })

  it('同一张图并发取回两次，缓存只计一份字节', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => image(100)),
    )
    const url = new URL(sourceImageUrl(SOURCE, 'same', 'Primary', 320, 't'))
    await Promise.all([handleSourceImage(url, use), handleSourceImage(url, use)])
    expect(sourceImageCacheBytes()).toBe(100)
  })

  it('同一来源最多 6 个并发上游请求', async () => {
    let active = 0
    let peak = 0
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active--
        return image()
      }),
    )
    await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        handleSourceImage(new URL(sourceImageUrl(SOURCE, `i${i}`, 'Primary', 320, 't')), use),
      ),
    )
    expect(peak).toBe(IMAGE_LIMITS.concurrency)
  })
})
