/**
 * @marchen/electron-ipc - Renderer 进程入口
 *
 * 提供 renderer 进程侧的 IPC 能力：
 * - createClient：创建带命名空间的 IPC 调用客户端（renderer → main）
 * - createListener：创建事件监听器（接收 main → renderer 的推送事件）
 *
 * 这个模块不依赖 Electron 主进程模块，只使用 renderer 进程可用的 ipcRenderer API。
 *
 * 使用方式：
 *   import { createClient, createListener } from '@marchen/electron-ipc/renderer'
 */

/**
 * ipcRenderer.invoke 的函数签名
 * 由调用方传入，避免直接依赖 electron 模块
 */
type IpcInvoke = (channel: string, ...args: any[]) => Promise<any>

/**
 * ipcRenderer.on 的函数签名
 * 返回一个取消监听的函数
 */
type IpcOn = (channel: string, callback: (...args: any[]) => void) => () => void

/**
 * ipcRenderer.send 的函数签名
 */
type IpcSend = (channel: string, ...args: any[]) => void

/**
 * 创建带命名空间的 IPC 调用客户端
 * 通过双层 Proxy 实现 `client.groupName.methodName(input)` 的调用方式
 *
 * 调用链路：
 *   client.player.grabFrame({ path, time })
 *     → ipcInvoke("player:grabFrame", { path, time })
 *       → ipcMain.handle("player:grabFrame", handler)
 *
 * @template T - MergeGroups 生成的 Router 类型，提供完整的类型推导
 * @param options.ipcInvoke - Electron 的 ipcRenderer.invoke 函数
 * @returns 带命名空间的类型安全客户端 Proxy
 *
 * @example
 * const ipcClient = createClient<IpcRouter>({
 *   ipcInvoke: window.electron.ipcRenderer.invoke,
 * })
 * // 调用时自动拼接 channel：'app:windowAction'
 * await ipcClient.app.windowAction({ action: 'close' })
 */
export const createClient = <
  T extends object,
>(options: {
  ipcInvoke: IpcInvoke
}) => {
  // 第一层 Proxy：拦截 group 名称访问（如 client.app、client.player）
  return new Proxy({} as T, {
    get: (_, groupName: string) => {
      // 第二层 Proxy：拦截方法名称访问（如 client.app.windowAction）
      return new Proxy(
        {},
        {
          get: (_, methodName: string) => {
            // 返回实际的调用函数，channel 格式为 '{groupName}:{methodName}'
            return (input: unknown) => options.ipcInvoke(`${groupName}:${methodName}`, input)
          },
        },
      )
    },
  })
}

/**
 * 创建事件监听器，用于接收 main 进程推送的事件
 * 事件 channel 不带 group 前缀，直接使用事件名称（如 'windowAction'、'showSetting'）
 *
 * 每个事件提供 .listen(callback) 方法，返回 unlisten 函数用于取消监听
 *
 * @template T - 事件接口类型（如 RendererHandlers），定义了所有可监听的事件及其参数
 * @param options.on - ipcRenderer.on 的封装，注册监听并返回取消函数
 * @param options.send - ipcRenderer.send 函数（预留，当前未使用）
 * @returns Proxy 对象，支持 listener.eventName.listen(callback) 的调用方式
 *
 * @example
 * const listener = createListener<RendererHandlers>({ on, send })
 * const unlisten = listener.windowAction.listen((action) => {
 *   console.log('窗口状态变化:', action)
 * })
 * // 取消监听
 * unlisten()
 */
export const createListener = <T extends object>(options: {
  on: IpcOn
  send: IpcSend
}) => {
  // 使用 Proxy 动态拦截事件名称访问
  return new Proxy({} as { [K in keyof T]: { listen: (callback: T[K]) => () => void } }, {
    get: (_, channel: string) => ({
      /**
       * 注册事件监听
       * @param callback - 事件回调函数，参数类型由 T[K] 推导
       * @returns 取消监听的函数
       */
      listen: (callback: (...args: any[]) => void) => {
        // on 的 callback 第一个参数是 IpcRendererEvent，需要跳过
        return options.on(channel, (_, ...args) => callback(...args))
      },
    }),
  })
}
