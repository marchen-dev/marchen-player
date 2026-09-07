import type { PlayerCapabilities } from './types'

export interface PlayerControlAvailability {
  transport: 'playlist' | 'time-skip'
  playlist: boolean
  embeddedSubtitle: boolean
  externalSubtitle: boolean
  fullscreen: boolean
}

/** 将能力对象收敛为 UI 分支，避免组件各自组合布尔值后产生平台漂移。 */
export const resolvePlayerControlAvailability = (
  capabilities: PlayerCapabilities,
): PlayerControlAvailability => ({
  transport: capabilities.playlist ? 'playlist' : 'time-skip',
  playlist: capabilities.playlist,
  embeddedSubtitle: capabilities.embeddedSubtitle,
  externalSubtitle: capabilities.externalSubtitle,
  fullscreen: capabilities.domFullscreen || capabilities.windowFullscreen,
})
