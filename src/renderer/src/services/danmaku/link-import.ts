import type { PlayerLoadingService } from '@marchen/player-loading'
import type {
  LinkIdentity,
  LinkProgress,
  LinkResponse,
  LinkSelection,
} from '@marchen/shared/danmaku'
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
  status: 'idle' | 'loading' | 'selecting' | 'committing' | 'success' | 'error' | 'cancelled'
  url: string
  offset: number
  message: string
  progress?: LinkProgress
  source?: string
  selection?: LinkSelection
}

/** 脱离面板挂载管理任务，面板关闭不打断请求；媒体会话切换立即撤销。 */
export class LinkImportController {
  private snapshot: ImportSnapshot = { status: 'idle', url: '', offset: 0, message: '' }
  private listeners = new Set<() => void>()
  private active?: { id: string; session: number; controller: AbortController }
  private pendingSession?: number
  private subscription
  constructor(
    private player: PlayerLoadingService,
    private transport: LinkTransport,
  ) {
    this.subscription = player.state$.subscribe(() => {
      if (this.active && player.sessionId !== this.active.session) this.cancel()
      if (this.pendingSession !== undefined && player.sessionId !== this.pendingSession)
        this.cancel()
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
    if (this.pendingSession !== undefined) {
      this.pendingSession = undefined
      this.publish({ status: 'cancelled', message: '已取消选集', selection: undefined })
    }
    const task = this.active
    if (!task || task.controller.signal.aborted) return
    task.controller.abort()
    void this.transport.cancel(task.id).catch(() => {})
    this.publish({ status: 'cancelled', message: '已取消导入' })
  }
  /** 只允许提交当前媒体会话里刚返回的候选项，换视频后旧选集立即失效。 */
  choose = async (url: string): Promise<void> => {
    if (
      this.pendingSession !== this.player.sessionId ||
      !this.snapshot.selection?.episodes.some((episode) => episode.url === url)
    )
      return
    await this.start(url, this.snapshot.offset)
  }
  dispose() {
    this.cancel()
    this.subscription.unsubscribe()
    this.listeners.clear()
  }
  async start(url: string, offset: number): Promise<void> {
    if (this.active) return
    this.pendingSession = undefined
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
      selection: undefined,
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
      let source = linkSourceId(identity.identity)
      const now = this.player.currentState
      if (
        (now.step === 'ready' || now.step === 'reloading') &&
        now.danmaku.some((entry) => entry.source === source)
      )
        throw new Error('已经添加过该来源')
      const response = await this.transport.fetch(task.id, identity.identity.canonicalUrl)
      if (!current()) return
      if (!response.ok) throw new Error(response.message)
      if (response.selection) {
        this.pendingSession = task.session
        this.publish({
          status: 'selecting',
          selection: response.selection,
          progress: undefined,
          message: '请选择要导入弹幕的剧集',
        })
        return
      }
      const result = response.result
      // B 站只有读取元信息后才能取得 CID；以最终身份去重并保存，合并 BV/EP 别名。
      source = linkSourceId(result.identity)
      const latest = this.player.currentState
      if (
        (latest.step === 'ready' || latest.step === 'reloading') &&
        latest.danmaku.some((entry) => entry.source === source)
      )
        throw new Error('已经添加过该来源')
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
        message: `已添加 ${result.content.count} 条弹幕${result.skipped ? `，跳过 ${result.skipped} 条无效或不支持的记录` : ''}${result.identity.provider === 'bilibili' ? '（当前弹幕池）' : ''}`,
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
