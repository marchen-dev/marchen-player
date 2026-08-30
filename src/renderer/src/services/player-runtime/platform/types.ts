export interface PlayerCapabilities {
  platform: 'electron' | 'web'
  directoryPlaylist: boolean
  embeddedSubtitle: boolean
  externalSubtitle: boolean
  snapshot: boolean
  ffmpegPlayback: boolean
  ffmpegPlaybackStatus: 'checking' | 'available' | 'unavailable' | 'native-only'
  windowFullscreen: boolean
  domFullscreen: boolean
}
