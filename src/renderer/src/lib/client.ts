import type { Router } from '@main/ipc'
import type { RendererHandlers } from '@marchen/shared/types/renderer-handlers'
import { createClient, createListener } from '@marchen/electron-ipc/renderer'

export const ipcClient = window.electron
  ? createClient<Router>({
      ipcInvoke: window.electron.ipcRenderer.invoke,
    })
  : null

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
