import type { WebContents } from 'electron'
import type { RendererHandlersCaller, RouterType } from './types'

import { ipcMain } from 'electron'

export { tipc } from './tipc'

export const registerIpc = (router: RouterType) => {
  for (const [groupName, group] of Object.entries(router)) {
    for (const [methodName, handler] of Object.entries(group)) {
      ipcMain.handle(`${groupName}:${methodName}`, (e, payload) => {
        return handler.action({ context: { sender: e.sender }, input: payload })
      })
    }
  }
}

export const createEmitter = <T extends object>(
  contents: WebContents,
) => {
  return new Proxy({} as RendererHandlersCaller<T & Record<string, (...args: any[]) => any>>, {
    get: (_, prop: string) => ({
      send: (...args: unknown[]) => contents.send(prop, ...args),
    }),
  })
}

export * from './types'
