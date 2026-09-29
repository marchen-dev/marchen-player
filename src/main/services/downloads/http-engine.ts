import type { DownloadTask } from '@marchen/shared/downloads'
import type { DownloadItem, Session } from 'electron'
import { rename, stat } from 'node:fs/promises'
import { session } from 'electron'
import { safeTaskPath } from './paths'

/** 独立 Session 隔离每次下载的 will-download 事件，不借用浏览器 Cookie。 */
export class HttpDownloadEngine {
  private items = new Map<string, DownloadItem>()
  private active = new Set<string>()
  private pending = new Map<
    string,
    {
      session: Session
      listener: Parameters<Session['once']>[1]
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private finishing = new Set<Promise<void>>()
  private closed = false
  constructor(
    private tasks: () => DownloadTask[],
    private changed: (completed?: boolean) => void,
  ) {}
  start(task: DownloadTask) {
    task.intent = 'running'
    task.state = 'waiting'
    task.error = undefined
    this.changed()
    this.pump()
  }
  private pump() {
    if (this.closed) return
    for (const task of this.tasks()) {
      if (this.active.size >= 3) break
      if (
        !task.http ||
        task.intent !== 'running' ||
        task.state !== 'waiting' ||
        this.active.has(task.id)
      )
        continue
      this.active.add(task.id)
      void this.launch(task).catch(() => {
        this.clearPending(task.id)
        this.failed(task, 'HTTP 下载启动失败，请检查链接和保存目录后重试')
      })
    }
  }
  private failed(task: DownloadTask, message: string) {
    task.state = 'error'
    task.downloadSpeed = 0
    task.error = message
    this.active.delete(task.id)
    this.changed()
    this.pump()
  }
  private async launch(task: DownloadTask) {
    const http = task.http!
    const existing = this.items.get(task.id)
    if (existing) {
      if (!existing.canResume() && existing.getState() === 'interrupted') {
        this.items.delete(task.id)
      } else {
        existing.resume()
        return
      }
    }
    const target = await safeTaskPath(task.directory, http.partialName)
    if (this.closed || task.intent !== 'running') {
      this.active.delete(task.id)
      return
    }
    const ses = session.fromPartition(`marchen-http-${task.id}-${Date.now()}`)
    const listener = (_event: Electron.Event, item: DownloadItem) => {
      const pending = this.pending.get(task.id)
      if (!pending) {
        item.cancel()
        return
      }
      clearTimeout(pending.timer)
      this.pending.delete(task.id)
      if (this.closed || task.intent !== 'running') {
        item.cancel()
        return
      }
      item.setSavePath(target)
      this.items.set(task.id, item)
      const update = () => {
        const file = task.files[0]
        file.size = item.getTotalBytes()
        file.verifiedBytes = item.getReceivedBytes()
        task.selectedBytes = file.size
        http.urlChain = item.getURLChain()
        http.etag = item.getETag()
        http.lastModified = item.getLastModifiedTime()
        http.offset = file.verifiedBytes
        task.updatedAt = Date.now()
        // 旧 Electron 版本通过字节差估算速度。
        const now = Date.now()
        task.downloadSpeed =
          task.intent === 'running'
            ? Math.max(
                0,
                ((file.verifiedBytes - previousBytes) * 1000) / Math.max(1, now - previousTime),
              )
            : 0
        previousBytes = file.verifiedBytes
        previousTime = now
        if (task.intent === 'running')
          task.state = item.getState() === 'interrupted' ? 'error' : 'downloading'
        if (item.getState() === 'interrupted') {
          task.error = item.canResume() ? '下载中断，可点击重试继续' : '下载中断，重试将从头下载'
          this.active.delete(task.id)
          this.pump()
        }
        this.changed()
      }
      let previousBytes = item.getReceivedBytes()
      let previousTime = Date.now()
      item.on('updated', update)
      item.once('done', (_event, state) => {
        this.items.delete(task.id)
        if (state !== 'completed') {
          this.failed(task, '下载未完成，重试将尝试续传')
          return
        }
        task.state = 'checking'
        task.downloadSpeed = 0
        const finishing = (async () => {
          const destination = await safeTaskPath(task.directory, task.files[0].path)
          // 目标是创建任务时独占预留的空文件；拒绝覆盖后来写入的内容。
          if ((await stat(destination)).size !== 0) throw new Error('目标文件已被修改')
          await rename(target, destination)
          const size = (await stat(destination)).size
          Object.assign(task.files[0], { size, verifiedBytes: size, complete: true })
          task.selectedBytes = size
          task.state = 'completed'
          task.intent = 'stopped'
          task.completedAt = Date.now()
          http.offset = size
          this.active.delete(task.id)
          this.changed(true)
          this.pump()
        })().catch(() => this.failed(task, '下载完成但文件保存失败，请检查目标目录'))
        this.finishing.add(finishing)
        void finishing.finally(() => this.finishing.delete(finishing))
      })
      if (item.getState() === 'interrupted') item.resume()
      else update()
    }
    const timer = setTimeout(() => {
      this.clearPending(task.id)
      this.failed(task, '连接超时，请检查链接后重试')
    }, 30000)
    this.pending.set(task.id, { session: ses, listener, timer })
    ses.once('will-download', listener)
    const info = await stat(target).catch(() => null)
    if (!this.pending.has(task.id)) return
    if (
      http.offset > 0 &&
      task.selectedBytes > http.offset &&
      info &&
      info.size >= http.offset &&
      http.etag &&
      http.lastModified
    ) {
      ses.createInterruptedDownload({
        path: target,
        urlChain: http.urlChain,
        offset: http.offset,
        length: task.selectedBytes,
        eTag: http.etag,
        lastModified: http.lastModified,
      })
    } else {
      // 缺少可靠续传条件时从头下载，不把新旧资源拼接。
      http.offset = 0
      task.files[0].verifiedBytes = 0
      ses.downloadURL(http.url)
    }
  }
  private clearPending(id: string) {
    const pending = this.pending.get(id)
    if (!pending) return
    clearTimeout(pending.timer)
    pending.session.removeListener('will-download', pending.listener)
    pending.session.once('will-download', (_event, item) => item.cancel())
    this.pending.delete(id)
  }
  pause(task: DownloadTask) {
    task.intent = 'paused'
    this.clearPending(task.id)
    this.items.get(task.id)?.pause()
    task.state = task.files[0].complete ? 'completed' : 'paused'
    task.downloadSpeed = 0
    this.active.delete(task.id)
    this.changed()
    this.pump()
  }
  forget(task: DownloadTask) {
    this.pause(task)
    const item = this.items.get(task.id)
    if (item) {
      item.removeAllListeners()
      this.items.delete(task.id)
    }
  }
  async shutdown() {
    this.closed = true
    for (const task of this.tasks())
      if (task.http && !task.files[0].complete && task.state !== 'checking') this.pause(task)
    await Promise.allSettled([...this.finishing])
  }
}
