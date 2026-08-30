import type { PlayerPorts } from './ports'
import { createElectronPlayerPorts } from './electron'
import { createWebPlayerPorts } from './web'

/** 仅在组合根判断平台，组件和各 Port 实现不再散落 isWeb 分支。 */
export const createPlayerPorts = (): PlayerPorts =>
  window.electron ? createElectronPlayerPorts() : createWebPlayerPorts()
