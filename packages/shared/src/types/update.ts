export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'upToDate'
  | 'available'
  | 'downloading'
  | 'preparing'
  | 'ready'
  | 'installing'
  | 'error'
export interface DesktopUpdateState {
  revision: number
  /**
   * linux：AppImage，可应用内下载安装；linux-manual：deb 等系统包，只检查新版本并引导去下载页，
   * 不在应用内替换自身。
   */
  platform: 'mac' | 'windows' | 'linux' | 'linux-manual' | 'unsupported'
  phase: UpdatePhase
  version?: string
  notes?: string
  percent?: number
  error?: string
}
