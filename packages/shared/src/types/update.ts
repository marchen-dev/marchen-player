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
  platform: 'mac' | 'windows' | 'unsupported'
  phase: UpdatePhase
  version?: string
  notes?: string
  percent?: number
  error?: string
}
