import type { DurableMediaSource } from '@marchen/shared/media'
import { isRemoteKind } from '@marchen/shared/media'

/**
 * 只限制内嵌提取，不影响外挂字幕或任何音视频内核。
 * 媒体源同样不在本地提取：Jellyfin/Emby 的内嵌字幕由服务端抽取后按外挂轨道提供。
 */
export const supportsEmbeddedSubtitles = (source: DurableMediaSource) => !isRemoteKind(source)

/**
 * 用户能否用到内嵌字幕，决定字幕面板是否提示「不支持」。
 * 与本地提取策略不同：Jellyfin/Emby 虽不在本地提取，但服务端会把内嵌文字字幕作为 provider 轨道提供；
 * WebDAV 只列同目录外挂文件，远程直链也没有服务端抽取，两者都用不到内嵌字幕。
 */
export const embeddedSubtitlesAvailable = (source: DurableMediaSource) =>
  supportsEmbeddedSubtitles(source) ||
  (source.kind === 'provider-item' && source.provider !== 'webdav')
