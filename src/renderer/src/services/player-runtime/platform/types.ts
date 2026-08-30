export interface PlayerCapabilities {
  platform: 'electron' | 'web'
  directoryPlaylist: boolean
  embeddedSubtitle: boolean
  externalSubtitle: boolean
  snapshot: boolean
  ffmpegPlayback: boolean
  windowFullscreen: boolean
  domFullscreen: boolean
}
