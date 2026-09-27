import type { RendererHandlers } from '@marchen/shared/types/renderer-handlers'
import { createEmitter, tipc } from '@marchen/electron-ipc/main'
import { resolveAdapter } from '../services/danmaku/registry'
import { DanmakuTasks } from '../services/danmaku/tasks'

const t = tipc.create()
const tasks = new DanmakuTasks()
export const danmakuGroup = {
  identify: t.procedure.input<{ url: string }>().action(async ({ input }) => {
    try {
      return { ok: true as const, identity: resolveAdapter(input.url).identity }
    } catch {
      return { ok: false as const, message: '暂不支持此视频链接' }
    }
  }),
  importLink: t.procedure
    .input<{ requestId: string; url: string }>()
    .action(async ({ input, context }) => {
      const sender = context.sender
      return tasks.run(
        sender.id,
        input.requestId,
        input.url,
        (progress) => {
          if (!sender.isDestroyed())
            createEmitter<RendererHandlers>(sender).danmakuImportProgress.send(progress)
        },
        (cancel) => {
          sender.once('destroyed', cancel)
          // Renderer 刷新也应取消旧页面所属的任务。
          sender.on('render-process-gone', cancel)
          sender.on('did-start-navigation', cancel)
          return () => {
            sender.removeListener('destroyed', cancel)
            sender.removeListener('render-process-gone', cancel)
            sender.removeListener('did-start-navigation', cancel)
          }
        },
      )
    }),
  cancelImport: t.procedure.input<{ requestId: string }>().action(async ({ input, context }) => {
    tasks.cancel(context.sender.id, input.requestId)
  }),
}
