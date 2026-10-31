import { registerIpc } from '@marchen/electron-ipc/main'

import { router } from '../ipc'
import { registerLog } from './log'
import { registerAppMenu } from './menu'

export const initializeApp = () => {
  registerIpc(router)
  registerAppMenu()
  registerLog()
}
