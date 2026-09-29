import { isVideoFile } from './file-open'

/** 单播放器在尚未就绪时只保留最新的打开意图，避免并发导入相互覆盖。 */
export class FileOpenRequests {
  private pending: string | undefined
  private deliver: ((path: string) => void) | undefined
  private wake: (() => void) | undefined

  request(path: string) {
    if (!isVideoFile(path)) return
    this.pending = path
    this.wake?.()
    this.flush()
  }

  requestFromArgv(argv: readonly string[]) {
    const path = argv.at(-1)
    if (path) this.request(path)
  }

  setWindowOpener(wake: () => void) {
    this.wake = wake
    if (this.pending) wake()
  }

  rendererReady(deliver: (path: string) => void) {
    this.deliver = deliver
    this.flush()
  }

  rendererUnavailable() {
    this.deliver = undefined
  }

  private flush() {
    if (!this.pending || !this.deliver) return
    const path = this.pending
    this.pending = undefined
    this.deliver(path)
  }
}

export const fileOpenRequests = new FileOpenRequests()
