import type { MediaSourceKind } from '@marchen/shared/media-sources'
import type { ProviderFactories } from './provider'
import { join } from 'node:path'
import { releaseSourceMediaLeases, setSourceImageHandler } from '@main/lib/media-protocol'
import { app } from 'electron'
import { clearSourceImages, handleSourceImage } from './image-proxy'
import { createJellyfinFamilyFactory } from './jellyfin-family'
import { MediaSourceRegistry } from './registry'
import { MEDIA_SOURCES_FILE, MediaSourceStore } from './store'
import { webdavFactory } from './webdav'

let registry: MediaSourceRegistry | undefined

const factories: ProviderFactories = {
  webdav: webdavFactory,
  jellyfin: createJellyfinFamilyFactory('jellyfin', () => app.getVersion()),
  emby: createJellyfinFamilyFactory('emby', () => app.getVersion()),
} satisfies Record<MediaSourceKind, unknown>

export const getMediaSources = () => {
  if (registry) return registry
  registry = new MediaSourceRegistry(
    new MediaSourceStore(join(app.getPath('userData'), MEDIA_SOURCES_FILE)),
    factories,
  )
  // 来源被移除、重新登录或重置时，撤销它的播放租约并丢弃海报缓存
  registry.onInvalidate((sourceId) => {
    releaseSourceMediaLeases(sourceId)
    clearSourceImages(sourceId)
  })
  return registry
}

// 海报代理在协议层注册；渲染页面加载海报前一定已经通过 IPC 浏览过来源
setSourceImageHandler((url) =>
  handleSourceImage(url, (sourceId, action) => getMediaSources().use(sourceId, action)),
)

/** 重置应用时调用：撤销租约、清空登录状态与海报缓存、删除配置文件。 */
export const clearMediaSources = () => getMediaSources().clear()
