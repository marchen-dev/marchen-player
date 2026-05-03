/**
 * @marchen/electron-ipc - 类型定义
 *
 * 提供 IPC 通信的核心类型，被 main.ts 和 renderer.ts 共同引用。
 * 通过泛型实现端到端的类型安全：
 *   main 端定义 handler 的 input/output 类型 → renderer 端自动推导调用签名
 */

import type { WebContents } from 'electron'

/**
 * IPC Handler 映射表（通过 module augmentation 由应用侧扩展）
 * 应用侧在 shared 包中 declare module '@marchen/electron-ipc/types' 来填充具体方法签名
 */
export interface IpcHandlerMap {}

/**
 * IPC handler 的执行上下文
 * 每次 renderer 调用 handler 时，main 端会收到这个上下文
 */
export interface IpcContext {
  /** 发起调用的 renderer 进程的 WebContents 引用 */
  sender: WebContents
}

/**
 * 单个 IPC handler 的类型定义
 * @template TInput - handler 接收的输入类型，void 表示无参数
 * @template TOutput - handler 返回的输出类型
 */
export interface IpcHandler<TInput = void, TOutput = unknown> {
  action: (params: { context: IpcContext; input: TInput }) => Promise<TOutput>
}

/**
 * IPC handler 分组
 * 每个 group 有一个唯一的名称（如 'app'、'player'），
 * 注册时会作为 IPC channel 的前缀：`{groupName}:{methodName}`
 *
 * @template TName - 分组名称的字面量类型
 * @template THandlers - 该分组下所有 handler 的映射
 */
export interface IpcGroup<
  TName extends string = string,
  THandlers extends Record<string, IpcHandler<any, any>> = Record<string, IpcHandler<any, any>>,
> {
  groupName: TName
  handlers: THandlers
}

/**
 * 从 IpcHandler 类型中提取 renderer 端的调用签名
 * - 如果 handler 无输入（TInput = void），生成 `() => Promise<O>`
 * - 如果 handler 有输入，生成 `(input: I) => Promise<O>`
 */
type ExtractReturnType<T> = [T] extends [IpcHandler<infer I, infer O>]
  ? [I] extends [void]
    ? () => Promise<O>
    : (input: I) => Promise<O>
  : never

/**
 * 将一个 IpcGroup 的 handlers 映射转换为 renderer 端的调用接口
 * 例如：{ windowAction: IpcHandler<{action: string}, void> }
 *   → { windowAction: (input: {action: string}) => Promise<void> }
 */
type GroupToClient<T extends IpcGroup> = {
  [K in keyof T['handlers']]: ExtractReturnType<T['handlers'][K]>
}

/**
 * 将多个 IpcGroup 合并为一个带命名空间的 Router 类型
 * 用于 createClient<IpcRouter> 的泛型参数
 *
 * 例如：MergeGroups<[typeof appGroup, typeof playerGroup]>
 *   → { app: { windowAction: ..., checkUpdate: ... }, player: { grabFrame: ... } }
 */
export type MergeGroups<T extends IpcGroup[]> = {
  [G in T[number] as G['groupName']]: GroupToClient<G>
}
