import type { DurableMediaSource } from '@marchen/shared/media'

/** 只限制内嵌提取，不影响外挂字幕或任何音视频内核。 */
export const supportsEmbeddedSubtitles = (source: DurableMediaSource) =>
  source.kind !== 'remote-url'
