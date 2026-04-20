/**
 * @marchen/electron-ipc - Main 进程入口
 *
 * 提供 main 进程侧的 IPC 能力：
 * - handler / defineGroup：定义带命名空间的 IPC handler
 * - registerIpc：将所有 group 注册到 Electron 的 ipcMain
 * - createEmitter：创建 main → renderer 的事件发射器
 *
 * 使用方式：
 *   import { defineGroup, handler, registerIpc, createEmitter } from '@marchen/electron-ipc/main'
 */

import type { WebContents } from 'electron'
import type { IpcContext, IpcGroup, IpcHandler } from './types'

import { ipcMain } from 'electron'

/**
 * 创建链式调用的内部辅助函数
 * 支持 handler<InputType>().action(fn) 的链式写法
 *
 * @template TInput - handler 接收的输入类型
 */
const createChainFns = <TInput = void>() => ({
  /**
   * 定义 handler 的处理函数
   * @param action - 接收 { context, input } 参数的异步函数
   * @returns IpcHandler 对象
   */
  action: <TOutput>(
    action: (params: { context: IpcContext; input: TInput }) => Promise<TOutput>,
  ): IpcHandler<TInput, TOutput> => ({ action }),
})

/**
 * 创建一个 IPC handler 定义
 * 通过泛型参数指定输入类型，然后链式调用 .action() 定义处理逻辑
 *
 * @template TInput - handler 接收的输入类型，不传则为 void（无参数）
 *
 * @example
 * // 无参数的 handler
 * handler().action(async ({ context }) => { ... })
 *
 * // 有参数的 handler
 * handler<{ action: string }>().action(async ({ context, input }) => { ... })
 */
export const handler = <TInput = void>() => createChainFns<TInput>()

/**
 * 将多个 handler 组织为一个命名分组
 * 分组名称会作为 IPC channel 的前缀，格式为 `{groupName}:{methodName}`
 *
 * @param groupName - 分组名称（如 'app'、'player'、'setting'）
 * @param handlers - 该分组下的 handler 映射
 * @returns IpcGroup 对象，用于传给 registerIpc
 *
 * @example
 * export const appGroup = defineGroup('app', {
 *   windowAction: handler<{ action: string }>()
 *     .action(async ({ context, input }) => { ... }),
 *   checkUpdate: handler()
 *     .action(async () => { ... }),
 * })
 */
export const defineGroup = <
  TName extends string,
  THandlers extends Record<string, IpcHandler<any, any>>,
>(
  groupName: TName,
  handlers: THandlers,
): IpcGroup<TName, THandlers> => ({ groupName, handlers })

/**
 * 将所有 IPC group 注册到 Electron 的 ipcMain.handle
 * 每个 handler 注册的 channel 名称为 `{groupName}:{methodName}`
 *
 * @param groups - defineGroup 返回的 group 数组
 *
 * @example
 * registerIpc([appGroup, playerGroup, settingGroup, utilsGroup])
 * // 注册的 channel：'app:windowAction', 'player:grabFrame', ...
 */
export const registerIpc = (groups: IpcGroup[]) => {
  for (const group of groups) {
    for (const [name, route] of Object.entries(group.handlers)) {
      // channel 格式：{groupName}:{methodName}，如 'app:windowAction'
      ipcMain.handle(`${group.groupName}:${name}`, (e, payload) => {
        // 将 Electron 的 IpcMainInvokeEvent 转换为我们的 IpcContext
        return route.action({ context: { sender: e.sender }, input: payload })
      })
    }
  }
}

/**
 * 创建 main → renderer 的事件发射器
 * 用于 main 进程主动向 renderer 推送事件（如窗口状态变化、更新进度等）
 *
 * 事件 channel 不加 group 前缀，直接使用事件名称（如 'windowAction'、'showSetting'）
 * 因为事件由 RendererHandlers 接口统一定义，数量少，不存在命名冲突
 *
 * @template T - 事件接口类型（如 RendererHandlers），定义了所有可发送的事件及其参数
 * @param contents - 目标 renderer 进程的 WebContents
 * @returns Proxy 对象，支持 emitter.eventName.send(data) 的调用方式
 *
 * @example
 * const emitter = createEmitter<RendererHandlers>(mainWindow.webContents)
 * emitter.windowAction.send('enter-full-screen')
 * emitter.updateProgress.send({ progress: 50, status: 'downloading' })
 */
export const createEmitter = <T extends object>(
  contents: WebContents,
) => {
  // 使用 Proxy 动态拦截属性访问，避免为每个事件手动创建 send 方法
  return new Proxy({} as { [K in keyof T]: { send: (...args: T[K] extends (...args: infer A) => any ? A : never[]) => void } }, {
    get: (_, prop: string) => ({
      send: (...args: unknown[]) => contents.send(prop, ...args),
    }),
  })
}
