import type { WebContents } from 'electron'

export interface ActionContext {
  sender: WebContents
}

export type ActionFunction<TInput = any, TResult = any> = (args: {
  context: ActionContext
  input: TInput
}) => Promise<TResult>

export interface HandlerEntry {
  action: ActionFunction
}

export type GroupType = Record<string, HandlerEntry>

export type RouterType = Record<string, GroupType>

export type ClientFromRouter<Router extends RouterType> = {
  [G in keyof Router]: {
    [K in keyof Router[G]]: Router[G][K]['action'] extends (options: {
      context: any
      input: infer P
    }) => Promise<infer R>
      ? [P] extends [void]
        ? () => Promise<R>
        : (input: P) => Promise<R>
      : never
  }
}

export type RendererHandlers = Record<string, (...args: any[]) => any>

export type RendererHandlersListener<T extends RendererHandlers> = {
  [K in keyof T]: {
    listen: (handler: (...args: Parameters<T[K]>) => void) => () => void
  }
}

export type RendererHandlersCaller<T extends RendererHandlers> = {
  [K in keyof T]: {
    send: (...args: Parameters<T[K]>) => void
  }
}
