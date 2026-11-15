import type { ClientFromRouter, RendererHandlersListener, RouterType } from './types'
import { decodeUserError, toUserError } from '@marchen/shared/errors'

type IpcInvoke = (channel: string, ...args: any[]) => Promise<any>

type IpcOn = (channel: string, callback: (...args: any[]) => void) => () => void

type IpcSend = (channel: string, ...args: any[]) => void

export const createClient = <Router extends RouterType>({
  ipcInvoke,
}: {
  ipcInvoke: IpcInvoke
}) => {
  return new Proxy<ClientFromRouter<Router>>({} as any, {
    get: (_, groupName: string) => {
      return new Proxy(
        {},
        {
          get: (_, methodName: string) => {
            return (input: unknown) =>
              ipcInvoke(`${groupName}:${methodName}`, input).catch((error: unknown) => {
                // 主进程把用户错误的错误码编码在错误文字里（见 main.ts），这里还原成 UserError；
                // 不带编码的错误保持原样
                const payload = decodeUserError(error instanceof Error ? error.message : error)
                throw payload ? toUserError(payload) : error
              })
          },
        },
      )
    },
  })
}

export const createListener = <T extends object>(options: { on: IpcOn; send: IpcSend }) => {
  return new Proxy({} as RendererHandlersListener<T & Record<string, (...args: any[]) => any>>, {
    get: (_, channel: string) => ({
      listen: (callback: (...args: any[]) => void) => {
        return options.on(channel, (_, ...args) => callback(...args))
      },
    }),
  })
}
