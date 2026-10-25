import type { DurableMediaSource } from '@marchen/shared/media'
import { isRemoteKind } from '@marchen/shared/media'

/**
 * 只限制内嵌提取，不影响外挂字幕或任何音视频内核。
 * 媒体源同样不在本地提取：Jellyfin/Emby 的内嵌字幕由服务端抽取后按外挂轨道提供。
 */
export const supportsEmbeddedSubtitles = (source: DurableMediaSource) => !isRemoteKind(source)
