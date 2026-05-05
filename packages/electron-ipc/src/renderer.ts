import type { ClientFromRouter, RendererHandlersListener, RouterType } from './types'

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
            return (input: unknown) => ipcInvoke(`${groupName}:${methodName}`, input)
          },
        },
      )
    },
  })
}

export const createListener = <T extends object>(options: {
  on: IpcOn
  send: IpcSend
}) => {
  return new Proxy({} as RendererHandlersListener<T & Record<string, (...args: any[]) => any>>, {
    get: (_, channel: string) => ({
      listen: (callback: (...args: any[]) => void) => {
        return options.on(channel, (_, ...args) => callback(...args))
      },
    }),
  })
}
