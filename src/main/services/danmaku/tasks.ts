import type { LinkProgress, LinkResponse } from '@marchen/shared/danmaku'
import { resolveAdapter } from './registry'

/** 任务按窗口归属；结束后释放监听，不保留结果或匿名凭据。 */
export class DanmakuTasks {
  private active = new Map<number, { id: string; controller: AbortController }>()
  constructor(private resolve = resolveAdapter) {}
  cancel(owner: number, id: string) {
    const task = this.active.get(owner)
    if (task?.id === id) task.controller.abort()
  }
  async run(
    owner: number,
    id: string,
    url: string,
    progress: (value: LinkProgress) => void,
    onClose: (cancel: () => void) => () => void,
  ): Promise<LinkResponse> {
    if (typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id))
      return { ok: false, message: '无效的导入任务' }
    if (this.active.has(owner)) return { ok: false, message: '已有弹幕导入任务，请稍后重试' }
    const controller = new AbortController()
    const task = { id, controller }
    this.active.set(owner, task)
    const timeout = setTimeout(() => controller.abort(new Error('弹幕读取超时，请重试')), 600000)
    const detach = onClose(() => controller.abort())
    try {
      const adapter = this.resolve(url)
      const result = await adapter.fetch(adapter.identity, controller.signal, (value) => {
        if (!controller.signal.aborted) progress({ ...value, requestId: id })
      })
      controller.signal.throwIfAborted()
      return { ok: true, result }
    } catch (error) {
      return {
        ok: false,
        message: controller.signal.aborted
          ? '导入已取消或超时'
          : error instanceof Error && !(error instanceof SyntaxError)
            ? error.message
            : '读取弹幕失败，请重试',
      }
    } finally {
      clearTimeout(timeout)
      detach()
      if (this.active.get(owner) === task) this.active.delete(owner)
    }
  }
}
