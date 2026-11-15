import type { RendererHandlers } from '@marchen/shared/types/renderer-handlers'
import { createEmitter, tipc } from '@marchen/electron-ipc/main'
import { toFailureResult } from '@marchen/shared/errors'
import { resolveAdapter } from '../services/danmaku/registry'
import { DanmakuTasks } from '../services/danmaku/tasks'

const t = tipc.create()
const tasks = new DanmakuTasks()
export const danmakuGroup = {
  identify: t.procedure.input<{ url: string }>().action(async ({ input }) => {
    try {
      return { ok: true as const, identity: resolveAdapter(input.url).identity }
    } catch (error) {
      // 识别失败的原因（链接无效、平台不支持）带着错误码返回
      return toFailureResult(
        error,
        // eslint-disable-next-line marchen/no-hardcoded-ui-text -- 没有错误码时的中文兜底说明
        '暂不支持此视频链接',
      )
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
