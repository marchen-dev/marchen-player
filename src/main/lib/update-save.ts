import { randomUUID } from 'node:crypto'
import { UserError } from '@marchen/shared/errors'

/** 单次保存屏障。迟到/重复回执不允许解除下一次退出保护。 */
export class UpdateSaveBarrier {
  private pending?: {
    id: string
    resolve: () => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }
  private running?: Promise<void>
  constructor(
    private readonly send: (id: string) => void,
    private readonly timeoutMs = 5000,
  ) {}
  wait(): Promise<void> {
    if (this.running) return this.running
    this.running = new Promise<void>((resolve, reject) => {
      const id = randomUUID()
      const timer = setTimeout(
        () =>
          this.finish(id, false, new UserError('update.save_timeout', '保存播放进度超时，请重试')),
        this.timeoutMs,
      )
      this.pending = { id, resolve, reject, timer }
      try {
        this.send(id)
      } catch (error) {
        this.finish(
          id,
          false,
          error instanceof Error
            ? error
            : new UserError('update.save_request_failed', '保存请求失败'),
        )
      }
    }).finally(() => {
      this.running = undefined
    })
    return this.running
  }
  /** failure：页面回报的失败说明（已按界面语言取好），或内部产生的错误 */
  finish(id: string, success: boolean, failure?: string | Error): void {
    const pending = this.pending
    if (!pending || pending.id !== id) return
    this.pending = undefined
    clearTimeout(pending.timer)
    if (success) pending.resolve()
    else
      pending.reject(
        failure instanceof Error
          ? failure
          : failure
            ? new Error(failure)
            : new UserError('update.save_failed', '保存播放进度失败，请重试'),
      )
  }
}
