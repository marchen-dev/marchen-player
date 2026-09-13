export interface PlayerPlatformCapabilities {
  platform: 'electron' | 'web'
  directoryPlaylist: boolean
  windowFullscreen: boolean
  domFullscreen: boolean
}

/** 已实现的业务功能与平台窗口/目录能力分开；解码能力由当前 MediaPort 报告。 */
export interface PlayerCapabilities extends PlayerPlatformCapabilities {
  playlist: boolean
  embeddedSubtitle: boolean
  externalSubtitle: boolean
}
