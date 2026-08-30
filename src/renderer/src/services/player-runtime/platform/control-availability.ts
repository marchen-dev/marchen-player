import type { PlayerCapabilities } from './types'

export interface PlayerControlAvailability {
  transport: 'playlist' | 'time-skip'
  playlist: boolean
  embeddedSubtitle: boolean
  externalSubtitle: boolean
  snapshot: boolean
  fullscreen: boolean
}

/** 将能力对象收敛为 UI 分支，避免组件各自组合布尔值后产生平台漂移。 */
export const resolvePlayerControlAvailability = (
  capabilities: PlayerCapabilities,
): PlayerControlAvailability => ({
  transport: capabilities.directoryPlaylist ? 'playlist' : 'time-skip',
  playlist: capabilities.directoryPlaylist,
  embeddedSubtitle: capabilities.embeddedSubtitle,
  externalSubtitle: capabilities.externalSubtitle,
  snapshot: capabilities.snapshot,
  fullscreen: capabilities.domFullscreen || capabilities.windowFullscreen,
})
