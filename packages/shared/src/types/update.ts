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
  /** 下载阶段已接收字节数，来自 electron-updater 的 download-progress 事件 */
  transferred?: number
  /** 下载阶段安装包总字节数 */
  total?: number
  /** 下载阶段即时速度（字节 / 秒），用于展示速度与估算剩余时间 */
  bytesPerSecond?: number
  error?: string
}
