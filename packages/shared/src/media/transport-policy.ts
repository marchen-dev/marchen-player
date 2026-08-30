import type { PlaybackMode, PlaybackTransport } from './source'

/** Gateway direct 完成打包态门禁前必须保持 custom protocol 为默认值。 */
export type DirectTransportBackend = 'custom-protocol' | 'gateway'

/**
 * 传输差异只允许出现在 source lifecycle 内部。
 * 业务层始终消费 PlaybackSourceLease，不应根据 mode 或 URL 自行选择后端。
 */
export const resolvePlaybackTransport = (
  mode: PlaybackMode,
  directBackend: DirectTransportBackend = 'custom-protocol',
): PlaybackTransport => {
  if (mode !== 'direct') return 'hls'
  return directBackend === 'gateway' ? 'http-range' : 'custom-protocol'
}
