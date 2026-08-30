import type { PlayerCapabilities } from './types'

export const webPlayerCapabilities: PlayerCapabilities = {
  platform: 'web',
  directoryPlaylist: false,
  embeddedSubtitle: false,
  externalSubtitle: true,
  snapshot: false,
  ffmpegPlayback: false,
  windowFullscreen: false,
  domFullscreen: true,
}

export const electronPlayerCapabilities: PlayerCapabilities = {
  platform: 'electron',
  directoryPlaylist: true,
  embeddedSubtitle: true,
  externalSubtitle: true,
  snapshot: true,
  ffmpegPlayback: false,
  windowFullscreen: true,
  domFullscreen: false,
}

const runningInWeb = typeof window === 'undefined' || !window.electron

export const playerCapabilities = runningInWeb ? webPlayerCapabilities : electronPlayerCapabilities
