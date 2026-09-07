import type { PlayerCapabilities } from './types'

export const webPlayerCapabilities: PlayerCapabilities = {
  platform: 'web',
  directoryPlaylist: false,
  playlist: true,
  embeddedSubtitle: true,
  externalSubtitle: true,
  windowFullscreen: false,
  domFullscreen: true,
}

export const electronPlayerCapabilities: PlayerCapabilities = {
  platform: 'electron',
  directoryPlaylist: true,
  playlist: true,
  embeddedSubtitle: true,
  externalSubtitle: true,
  windowFullscreen: true,
  domFullscreen: false,
}

const runningInWeb = typeof window === 'undefined' || !window.electron

export const playerCapabilities = runningInWeb ? webPlayerCapabilities : electronPlayerCapabilities
