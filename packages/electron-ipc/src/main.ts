import type { WebContents } from 'electron'
import type { RendererHandlersCaller, RouterType } from './types'

import { encodeUserError, isUserError } from '@marchen/shared/errors'
import { ipcMain } from 'electron'

export { tipc } from './tipc'

export const registerIpc = (router: RouterType) => {
  for (const [groupName, group] of Object.entries(router)) {
    for (const [methodName, handler] of Object.entries(group)) {
      ipcMain.handle(`${groupName}:${methodName}`, async (e, payload) => {
        try {
          return await handler.action({ context: { sender: e.sender }, input: payload })
        } catch (error) {
          // Electron 跨进程只传错误文字，自定义字段会丢失。带错误码的用户错误在这里把
          // 错误码与参数编码进文字，页面的调用代理（renderer.ts）再还原，界面才能按错误码
          // 显示对应语言的文案。其他错误原样抛出，行为不变。
          if (isUserError(error)) throw new Error(encodeUserError(error))
          throw error
        }
      })
    }
  }
}

export const createEmitter = <T extends object>(contents: WebContents) => {
  return new Proxy({} as RendererHandlersCaller<T & Record<string, (...args: any[]) => any>>, {
    get: (_, prop: string) => ({
      send: (...args: unknown[]) => contents.send(prop, ...args),
    }),
  })
}

export * from './types'
