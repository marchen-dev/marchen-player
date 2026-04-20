/**
 * IPC 客户端和事件监听器
 *
 * 封装 renderer 端与 main 进程的通信：
 * - ipcClient：调用 main 端的 IPC handler（renderer → main）
 * - handlers：监听 main 端推送的事件（main → renderer）
 *
 * 在 Web 环境下（非 Electron），两者均为 null，
 * 调用方需通过 ipcClient?.group.method() 的可选链方式使用
 */

import type { IpcRouter } from '@main/tipc'
import type { RendererHandlers } from '@marchen/shared/types/renderer-handlers'
import { createClient, createListener } from '@marchen/electron-ipc/renderer'

/**
 * IPC 调用客户端
 * 通过 Proxy 实现 ipcClient.group.method(input) 的调用方式
 * 在非 Electron 环境下为 null
 */
export const ipcClient = window.electron
  ? createClient<IpcRouter>({
      ipcInvoke: window.electron.ipcRenderer.invoke,
    })
  : null

/**
 * 事件监听器
 * 用于监听 main 进程推送的事件（如窗口状态变化、更新进度等）
 * 在非 Electron 环境下为 null
 */
export const handlers = window.electron
  ? createListener<RendererHandlers>({
      on: (channel, callback) => {
        if (!window.electron) return () => {}
        const remover = window.electron.ipcRenderer.on(channel, callback)
        return () => {
          remover()
        }
      },
      send: window.electron.ipcRenderer.send,
    })
  : null
