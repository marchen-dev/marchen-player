import type { PlayerLoadingService } from '@marchen/player-loading'
import type { LinkIdentity, LinkProgress, LinkResponse } from '@marchen/shared/danmaku'
import { linkSourceId, validateOffset } from '@marchen/shared/danmaku'

export interface LinkTransport {
  identify: (
    url: string,
  ) => Promise<{ ok: true; identity: LinkIdentity } | { ok: false; message: string }>
  fetch: (requestId: string, url: string) => Promise<LinkResponse>
  cancel: (requestId: string) => Promise<unknown>
  listen: (callback: (value: LinkProgress) => void) => () => void
}
export interface ImportSnapshot {
  status: 'idle' | 'loading' | 'committing' | 'success' | 'error' | 'cancelled'
  url: string
  offset: number
  message: string
  progress?: LinkProgress
  source?: string
}

/** 脱离面板挂载管理任务，面板关闭不打断请求；媒体会话切换立即撤销。 */
export class LinkImportController {
  private snapshot: ImportSnapshot = { status: 'idle', url: '', offset: 0, message: '' }
  private listeners = new Set<() => void>()
  private active?: { id: string; session: number; controller: AbortController }
  private subscription
  constructor(
    private player: PlayerLoadingService,
    private transport: LinkTransport,
  ) {
    this.subscription = player.state$.subscribe(() => {
      if (this.active && player.sessionId !== this.active.session) this.cancel()
    })
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private publish(value: Partial<ImportSnapshot>) {
    this.snapshot = { ...this.snapshot, ...value }
    this.listeners.forEach((listener) => listener())
  }
  cancel = () => {
    const task = this.active
    if (!task || task.controller.signal.aborted) return
    task.controller.abort()
    void this.transport.cancel(task.id).catch(() => {})
    this.publish({ status: 'cancelled', message: '已取消导入' })
  }
  dispose() {
    this.cancel()
    this.subscription.unsubscribe()
    this.listeners.clear()
  }
  async start(url: string, offset: number): Promise<void> {
    if (this.active) return
    const state = this.player.currentState
    if (state.step !== 'ready') {
      this.publish({ status: 'error', message: '请先打开视频' })
      return
    }
    try {
      offset = validateOffset(offset)
    } catch (error) {
      this.publish({
        status: 'error',
        message: error instanceof Error ? error.message : '偏移无效',
      })
      return
    }
    const task = {
      id: crypto.randomUUID(),
      session: this.player.sessionId,
      controller: new AbortController(),
    }
    this.active = task
    this.publish({
      status: 'loading',
      url,
      offset,
      message: '正在识别链接…',
      progress: undefined,
      source: undefined,
    })
    const current = () => !task.controller.signal.aborted && this.player.sessionId === task.session
    const unlisten = this.transport.listen((progress) => {
      if (progress.requestId === task.id && current())
        this.publish({
          progress,
          message:
            progress.stage === 'metadata'
              ? '正在读取视频信息…'
              : `${progress.title ?? ''} · ${progress.completed}/${progress.total} 段 · ${progress.count} 条`,
        })
    })
    try {
      const identity = await this.transport.identify(url)
      if (!current()) return
      if (!identity.ok) throw new Error(identity.message)
      const source = linkSourceId(identity.identity)
      const now = this.player.currentState
      if (
        (now.step === 'ready' || now.step === 'reloading') &&
        now.danmaku.some((entry) => entry.source === source)
      )
        throw new Error('已经添加过该来源')
      const response = await this.transport.fetch(task.id, identity.identity.canonicalUrl)
      if (!current()) return
      if (!response.ok) throw new Error(response.message)
      const result = response.result
      this.publish({ status: 'committing', message: '正在保存弹幕…' })
      await this.player.addLinkDanmaku(
        {
          type: 'link',
          ...result.identity,
          source,
          title: result.title,
          content: result.content,
          offsetSeconds: offset,
          selected: true,
        },
        task.session,
        task.controller.signal,
      )
      if (!current()) return
      this.publish({
        status: 'success',
        source,
        message: `已添加 ${result.content.count} 条弹幕${result.skipped ? `，跳过 ${result.skipped} 条无效记录` : ''}`,
      })
    } catch (error) {
      if (current())
        this.publish({
          status: 'error',
          message: error instanceof Error ? error.message : '导入失败，请重试',
        })
    } finally {
      unlisten()
      if (this.active === task) this.active = undefined
    }
  }
}
