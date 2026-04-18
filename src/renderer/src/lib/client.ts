import type { Router } from '@main/tipc'
import type { RendererHandlers } from '@main/tipc/renderer-handlers'
import { createClient, createEventHandlers } from '@egoist/tipc/renderer'

export const tipcClient = window.electron
  ? createClient<Router>({
      ipcInvoke: window.electron.ipcRenderer.invoke,
    })
  : null

// renderer/tipc.ts
export const handlers = window.electron
  ? createEventHandlers<RendererHandlers>({
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
