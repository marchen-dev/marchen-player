/**
 * @marchen/electron-ipc - Main 进程入口
 *
 * 提供 main 进程侧的 IPC 能力：
 * - defineGroup：定义带命名空间的 IPC handler（类型由 IpcHandlerMap 契约自动约束）
 * - registerIpc：将所有 group 注册到 Electron 的 ipcMain
 * - createEmitter：创建 main → renderer 的事件发射器
 *
 * 使用方式：
 *   import { defineGroup, registerIpc, createEmitter } from '@marchen/electron-ipc/main'
 */

import type { WebContents } from 'electron'
import type { IpcContext, IpcGroup, IpcHandler, IpcHandlerMap } from './types'

import { ipcMain } from 'electron'

/**
 * 从 IpcHandlerMap 的函数签名提取 Input 类型
 */
type ExtractInput<T> = T extends (input: infer I) => Promise<any> ? I : void

/**
 * 从 IpcHandlerMap 的函数签名提取 Output 类型
 */
type ExtractOutput<T> = T extends (...args: any[]) => Promise<infer O> ? O : never

/**
 * 将 IpcHandlerMap 中的函数签名转换为 defineGroup 接受的 action 函数映射
 * 每个方法变成 (params: { context, input }) => Promise<O> 格式
 */
type ActionHandlers<T> = {
  [K in keyof T]: (params: {
    context: IpcContext
    input: ExtractInput<T[K]>
  }) => Promise<ExtractOutput<T[K]>>
}

/**
 * 将多个 handler 组织为一个命名分组
 * 分组名称会作为 IPC channel 的前缀，格式为 `{groupName}:{methodName}`
 *
 * 当 IpcHandlerMap 中存在对应 group 定义时，自动约束 handlers 必须实现所有方法，
 * 且每个 action 函数的 input/output 类型与契约匹配。input 类型在回调内自动推导。
 *
 * @param groupName - 分组名称（如 'app'、'player'、'setting'）
 * @param handlers - 该分组下的 action 函数映射
 * @returns IpcGroup 对象，用于传给 registerIpc
 *
 * @example
 * export const settingGroup = defineGroup('setting', {
 *   setTheme: async ({ input }) => {
 *     // input 自动推导为 AppTheme
 *     nativeTheme.themeSource = input
 *   },
 * })
 */
export function defineGroup<
  TName extends string & keyof IpcHandlerMap,
>(
  groupName: TName,
  handlers: ActionHandlers<IpcHandlerMap[TName]>,
): IpcGroup<TName, { [K in keyof IpcHandlerMap[TName]]: IpcHandler<ExtractInput<IpcHandlerMap[TName][K]>, ExtractOutput<IpcHandlerMap[TName][K]>> }>
export function defineGroup<
  TName extends string,
>(
  groupName: TName,
  handlers: Record<string, (params: { context: IpcContext; input: any }) => Promise<any>>,
): IpcGroup<TName>
export function defineGroup(
  groupName: string,
  handlers: Record<string, (params: { context: IpcContext; input: any }) => Promise<any>>,
): IpcGroup {
  // 将 action 函数包装为 IpcHandler 对象
  const wrappedHandlers: Record<string, IpcHandler<any, any>> = {}
  for (const [name, action] of Object.entries(handlers)) {
    wrappedHandlers[name] = { action }
  }
  return { groupName, handlers: wrappedHandlers }
}

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
