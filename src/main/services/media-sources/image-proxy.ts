import type { SourceImageKind } from '@marchen/shared/media-sources'
import type { MediaSourceProvider } from './provider'
import { createAuthorizedFetcher } from '@main/lib/remote-media'
import {
  bucketImageWidth,
  SOURCE_IMAGE_HOST,
  SOURCE_IMAGE_KINDS,
  SOURCE_IMAGE_WIDTHS,
} from '@marchen/shared/media-sources'
import { providerRequest, readLimitedBytes } from './provider'

/**
 * 海报统一走主进程代理：
 * 页面运行在 secure 的 marchen://app 下，局域网 http:// 图片属于混合内容，
 * Chromium 会自动升级为 https 而加载失败（dev 的 http://localhost 页面不受影响，只在打包后出现）。
 * 代理还能带上 token，兼容开启了图片鉴权的服务器。
 */
export const IMAGE_LIMITS = {
  bytes: 5 * 1024 * 1024,
  timeout: 10_000,
  concurrency: 6,
  cache: 48 * 1024 * 1024,
} as const

const UUID = /^[0-9a-f-]{36}$/i
const ITEM_ID = /^[\w-]{1,64}$/

export function sourceImageUrl(
  sourceId: string,
  itemId: string,
  kind: SourceImageKind,
  width: number,
  tag: string,
) {
  const query = new URLSearchParams({ w: String(bucketImageWidth(width)), tag })
  return `marchen://${SOURCE_IMAGE_HOST}/${sourceId}/${itemId}/${kind}?${query}`
}

interface CachedImage {
  bytes: Uint8Array
  type: string
}

/** 插入顺序即最近使用顺序：命中时删除再插入，超出预算时从头淘汰 */
const cache = new Map<string, CachedImage>()
let cacheBytes = 0

function remember(key: string, image: CachedImage) {
  if (image.bytes.byteLength > IMAGE_LIMITS.cache) return
  // 同一张图并发取回时会重复写入，替换前先扣掉旧条目，避免计数只增不减
  const previous = cache.get(key)
  if (previous) {
    cache.delete(key)
    cacheBytes -= previous.bytes.byteLength
  }
  cache.set(key, image)
  cacheBytes += image.bytes.byteLength
  for (const [oldKey, old] of cache) {
    if (cacheBytes <= IMAGE_LIMITS.cache) break
    cache.delete(oldKey)
    cacheBytes -= old.bytes.byteLength
  }
}

function recall(key: string) {
  const image = cache.get(key)
  if (!image) return
  cache.delete(key)
  cache.set(key, image)
  return image
}

/** 移除来源、重新登录或重置时丢弃对应缓存；undefined 表示全部 */
export function clearSourceImages(sourceId?: string) {
  for (const [key, image] of cache)
    if (sourceId === undefined || key.startsWith(`${sourceId}/`)) {
      cache.delete(key)
      cacheBytes -= image.bytes.byteLength
    }
}

export const sourceImageCacheBytes = () => cacheBytes

/** 每个来源最多 6 个并发上游请求，超出的排队，避免首次进入大型媒体库时打满服务器 */
const slots = new Map<string, { active: number; queue: Array<() => void> }>()
async function acquire(sourceId: string) {
  const slot = slots.get(sourceId) ?? { active: 0, queue: [] }
  slots.set(sourceId, slot)
  if (slot.active < IMAGE_LIMITS.concurrency) {
    slot.active++
  } else {
    await new Promise<void>((resolve) => slot.queue.push(resolve))
  }
  return () => {
    const next = slot.queue.shift()
    if (next) next()
    else if (--slot.active === 0) slots.delete(sourceId)
  }
}

export type WithProvider = <T>(
  sourceId: string,
  action: (provider: MediaSourceProvider) => Promise<T>,
) => Promise<T>

const notFound = () => new Response(null, { status: 404 })

/** 处理 marchen://source-image/<sourceId>/<itemId>/<kind>?w=&tag=；任何失败都返回 404，由界面显示占位图 */
export async function handleSourceImage(url: URL, withProvider: WithProvider): Promise<Response> {
  const [sourceId, itemId, kind, ...rest] = url.pathname.split('/').filter(Boolean)
  const width = Number(url.searchParams.get('w'))
  const tag = url.searchParams.get('tag') ?? ''
  if (
    rest.length ||
    !UUID.test(sourceId ?? '') ||
    !ITEM_ID.test(itemId ?? '') ||
    !(SOURCE_IMAGE_KINDS as readonly string[]).includes(kind ?? '') ||
    !(SOURCE_IMAGE_WIDTHS as readonly number[]).includes(width) ||
    tag.length > 128
  )
    return notFound()
  const key = `${sourceId}/${itemId}/${kind}/${width}/${tag}`
  let image = recall(key)
  if (!image) {
    const release = await acquire(sourceId)
    try {
      image =
        recall(key) ??
        (await fetchImage(withProvider, sourceId, itemId, kind as SourceImageKind, width, tag))
      if (!image) return notFound()
      remember(key, image)
    } catch {
      return notFound()
    } finally {
      release()
    }
  }
  return new Response(image.bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      'Content-Type': image.type,
      'Content-Length': String(image.bytes.byteLength),
      'Cache-Control': 'private, max-age=600',
    },
  })
}

async function fetchImage(
  withProvider: WithProvider,
  sourceId: string,
  itemId: string,
  kind: SourceImageKind,
  width: number,
  tag: string,
): Promise<CachedImage | undefined> {
  return withProvider(sourceId, async (provider) => {
    // 上游地址只由来源配置拼出，不接受 renderer 传入的任意 URL
    const upstream = provider.imageUrl?.(itemId, kind, width, tag)
    if (!upstream) return undefined
    const fetcher = createAuthorizedFetcher(provider.authHeaders(), provider.origin)
    const response = await providerRequest(fetcher, upstream, {}, IMAGE_LIMITS.timeout)
    const type = response.headers.get('Content-Type') ?? ''
    if (!/^image\//i.test(type)) {
      await response.body?.cancel()
      return undefined
    }
    return { bytes: await readLimitedBytes(response, IMAGE_LIMITS.bytes), type }
  })
}
