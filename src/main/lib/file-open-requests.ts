import { randomUUID } from 'node:crypto'
import { isAbsolute, win32 } from 'node:path'
import { isVideoFile } from './file-open'

/** 单播放器在尚未就绪时只保留最新的打开意图，避免并发导入相互覆盖。 */
export class FileOpenRequests {
  private torrents: Array<{ id: string; path: string }> = []
  private torrentDeliver?: (request: { id: string; path: string }) => void
  private sentTorrent?: string
  private pending: string | undefined
  private deliver: ((path: string) => void) | undefined
  private wake: (() => void) | undefined

  request(path: string) {
    if (/\.torrent$/i.test(path)) {
      if (this.torrents.length >= 32 || this.torrents.some((item) => item.path === path)) return
      this.torrents.push({ id: randomUUID(), path })
      this.wake?.()
      this.flushTorrent()
      return
    }
    if (!isVideoFile(path)) return
    this.pending = path
    this.wake?.()
    this.flush()
  }

  requestFromArgv(argv: readonly string[]) {
    for (const path of argv) if (isAbsolute(path) || win32.isAbsolute(path)) this.request(path)
  }

  setWindowOpener(wake: () => void) {
    this.wake = wake
    if (this.pending || this.torrents.length) wake()
  }

  rendererReady(deliver: (path: string) => void) {
    this.deliver = deliver
    this.flush()
  }

  rendererUnavailable() {
    this.deliver = undefined
    this.torrentDeliver = undefined
    this.sentTorrent = undefined
  }

  torrentReady(deliver: (request: { id: string; path: string }) => void) {
    this.torrentDeliver = deliver
    this.flushTorrent()
  }
  torrentHandled(id: string) {
    if (this.torrents[0]?.id !== id) return
    this.torrents.shift()
    this.sentTorrent = undefined
    this.flushTorrent()
  }
  private flushTorrent() {
    const first = this.torrents[0]
    if (!first || !this.torrentDeliver || first.id === this.sentTorrent) return
    this.sentTorrent = first.id
    this.torrentDeliver(first)
  }
  private flush() {
    if (!this.pending || !this.deliver) return
    const path = this.pending
    this.pending = undefined
    this.deliver(path)
  }
}

export const fileOpenRequests = new FileOpenRequests()
