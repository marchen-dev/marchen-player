import type { PlayerCapabilities } from '@renderer/services/player-runtime/platform/types'

export const playerSettingsSections = ['playback', 'danmaku', 'subtitle', 'playlist'] as const

export type PlayerSettingsSection = (typeof playerSettingsSections)[number]

export interface PlayerSettingsPanelState {
  open: boolean
  section: PlayerSettingsSection
}

export const initialPlayerSettingsPanelState: PlayerSettingsPanelState = {
  open: false,
  section: 'playback',
}

export function getAvailablePlayerSettingsSections(
  capabilities: PlayerCapabilities,
): PlayerSettingsSection[] {
  return playerSettingsSections.filter((section) => {
    if (section === 'subtitle')
      return capabilities.embeddedSubtitle || capabilities.externalSubtitle
    if (section === 'playlist') return capabilities.directoryPlaylist
    return true
  })
}

export function normalizePlayerSettingsSection(
  section: PlayerSettingsSection,
  capabilities: PlayerCapabilities,
): PlayerSettingsSection {
  return getAvailablePlayerSettingsSections(capabilities).includes(section) ? section : 'playback'
}

export function openPlayerSettingsPanel(
  state: PlayerSettingsPanelState,
  section: PlayerSettingsSection = state.section,
): PlayerSettingsPanelState {
  return { open: true, section }
}

export function closePlayerSettingsPanel(
  state: PlayerSettingsPanelState,
): PlayerSettingsPanelState {
  return { ...state, open: false }
}
