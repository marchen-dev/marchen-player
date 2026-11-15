import type { PlayerLoadingService } from '@marchen/player-loading'
import type {
  LinkIdentity,
  LinkProgress,
  LinkResponse,
  LinkSelection,
} from '@marchen/shared/danmaku'
import { linkSourceId, validateOffset } from '@marchen/shared/danmaku'
import { errorFromFailure, UserError } from '@marchen/shared/errors'
import { describeError } from '@renderer/lib/errors'
import { t } from '@renderer/lib/i18n'

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
      this.publish({
        status: 'cancelled',
        message: t('danmaku:link.status.selectionCancelled'),
        selection: undefined,
      })
    }
    const task = this.active
    if (!task || task.controller.signal.aborted) return
    task.controller.abort()
    void this.transport.cancel(task.id).catch(() => {})
    this.publish({ status: 'cancelled', message: t('danmaku:link.status.cancelled') })
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
      this.publish({ status: 'error', message: t('danmaku:link.status.needVideo') })
      return
    }
    try {
      offset = validateOffset(offset)
    } catch (error) {
      this.publish({
        status: 'error',
        message: describeError(error, t('danmaku:link.offset.invalid')),
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
      message: t('danmaku:link.status.identifying'),
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
              ? t('danmaku:link.status.readingInfo')
              : t('danmaku:link.status.progress', {
                  title: progress.title ?? '',
                  completed: progress.completed,
                  segments: progress.total ?? 0,
                  danmaku: progress.count,
                }),
        })
    })
    try {
      const identity = await this.transport.identify(url)
      if (!current()) return
      if (!identity.ok) throw errorFromFailure(identity, t('danmaku:link.status.failed'))
      let source = linkSourceId(identity.identity)
      const now = this.player.currentState
      if (
        (now.step === 'ready' || now.step === 'reloading') &&
        now.danmaku.some((entry) => entry.source === source)
      )
        throw new UserError('danmakuLink.duplicate', '已经添加过该来源')
      const response = await this.transport.fetch(task.id, identity.identity.canonicalUrl)
      if (!current()) return
      if (!response.ok) throw errorFromFailure(response, t('danmaku:link.status.failed'))
      if (response.selection) {
        this.pendingSession = task.session
        this.publish({
          status: 'selecting',
          selection: response.selection,
          progress: undefined,
          message: t('danmaku:link.status.chooseEpisode'),
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
        throw new UserError('danmakuLink.duplicate', '已经添加过该来源')
      this.publish({ status: 'committing', message: t('danmaku:link.status.saving') })
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
        message:
          (result.skipped
            ? t('danmaku:link.status.addedSkipped', {
                total: result.content.count,
                skipped: result.skipped,
              })
            : t('danmaku:link.status.added', { total: result.content.count })) +
          (result.identity.provider === 'bilibili'
            ? t('danmaku:link.status.currentPoolSuffix')
            : ''),
      })
    } catch (error) {
      if (current())
        this.publish({
          status: 'error',
          message: describeError(error, t('danmaku:link.status.failed')),
        })
    } finally {
      unlisten()
      if (this.active === task) this.active = undefined
    }
  }
}
