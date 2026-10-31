/**
 * PlayerLoadingService
 *
 * 核心 Service class，管理弹幕加载的完整生命周期。
 * 所有操作通过 command 触发，状态通过 state$ 输出。
 *
 * 设计模式：
 * - Command Pattern：统一入口，所有操作通过 dispatch
 * - Observer Pattern：state$ 供多个消费者订阅
 * - Strategy Pattern：Port 接口实现可替换
 * - State Pattern：状态机明确定义转换规则
 */

import type { Observable, Subscription } from 'rxjs'
import type {
  BackgroundPhase,
  Command,
  CommentsData,
  DanmakuEntry,
  LoadingState,
  MatchedVideo,
  PipelineEvent,
  PlayNowStep,
  ServiceDeps,
  VideoInfo,
} from './types'
import { validateOffset } from '@marchen/shared/danmaku'
import { BehaviorSubject, concat, defer, EMPTY, firstValueFrom, of, Subject } from 'rxjs'
import { catchError, filter, ignoreElements, map, switchMap, takeUntil } from 'rxjs/operators'

import { LoadingOperations } from './operation'
import {
  executeFetchDanmaku,
  executeFinish,
  executeMatch,
  getAvailableDanmaku,
} from './pipelines/load'
import { createRematchPipeline } from './pipelines/rematch'
import { INITIAL_STATE, mergeDanmakuEntries, reduce } from './state-machine'
import { getPersistentMediaSource } from './types'

/** 未匹配时的占位，与跳过弹幕的约定一致 */
const UNMATCHED: MatchedVideo = { episodeId: 0, animeTitle: '', episodeTitle: '', animeId: 0 }

export class PlayerLoadingService {
  // 命令输入流
  private command$ = new Subject<Command>()
  // 销毁信号
  private destroy$ = new Subject<void>()
  // 依赖注入
  private deps: ServiceDeps

  // 状态输出流（BehaviorSubject 保证新订阅者立即获得当前状态）
  private stateSubject = new BehaviorSubject<LoadingState>(INITIAL_STATE)

  /** 只读状态流，供 React 组件订阅 */
  readonly state$ = this.stateSubject.asObservable()

  /** 当前状态快照（同步读取） */
  get currentState(): LoadingState {
    return this.stateSubject.value
  }

  private subscription: Subscription

  constructor(deps: ServiceDeps) {
    this.deps = deps

    // 所有获准命令共享切换边界：切集、跳过、取消都会终止旧分支。
    this.subscription = this.command$
      .pipe(
        filter((cmd) => this.canExecute(cmd)),
        switchMap((cmd) => {
          if (
            ['loadFromUrl', 'loadFromProvider', 'loadFromFile', 'loadFromPath', 'cancel'].includes(
              cmd.type,
            )
          )
            this.session++
          const state = this.currentState
          const operationDeps = this.operations.start(this.deps)
          this.activeDeps = operationDeps
          return this.executeCommand(cmd, state, operationDeps).pipe(
            catchError((err) =>
              of<PipelineEvent>({
                type: 'error',
                message: err instanceof Error ? err.message : '加载失败',
                previousStep: this.currentState.step,
                remoteRequest:
                  cmd.type === 'loadFromUrl' ? { url: cmd.url, recordId: cmd.recordId } : undefined,
                providerRequest:
                  cmd.type === 'loadFromProvider'
                    ? { sourceId: cmd.sourceId, itemRef: cmd.itemRef }
                    : undefined,
              }),
            ),
          )
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((event) => {
        const previous = this.currentState
        const next = reduce(previous, event)
        if (
          'video' in previous &&
          previous.video?.hash &&
          (!('video' in next) || next.video?.source !== previous.video.source)
        )
          this.deps.importer.releaseImportedVideo?.(previous.video as VideoInfo)
        this.stateSubject.next(next)
      })
  }

  private session = 0
  /** 不用 hash 代替媒体会话，同一个文件重开也要隔离旧请求。 */
  get sessionId() {
    return this.session
  }
  private sourceWrites: Promise<void> = Promise.resolve()
  private sourceWriteCount = 0
  private operations = new LoadingOperations()
  private activeDeps?: ServiceDeps

  private canExecute(cmd: Command): boolean {
    const state = this.currentState
    switch (cmd.type) {
      case 'loadFromUrl':
      case 'loadFromProvider':
      case 'loadFromFile':
      case 'loadFromPath':
      case 'cancel':
        return true
      case 'playNow':
        return ['matching', 'loading_danmaku', 'waiting_user', 'match_failed'].includes(state.step)
      case 'retryMatch':
        // 优先播放模式的匹配失败发生在播放中，原地重试不离开 ready
        return state.step === 'match_failed' || (state.step === 'ready' && !!state.matchError)
      case 'manualMatch':
        return state.step === 'match_failed'
      case 'selectMatch':
        return state.step === 'waiting_user'
      case 'rematch':
        return state.step === 'ready'
      case 'retryDanmaku':
        return (
          state.step === 'ready' && (state.recovery?.target.episodeId ?? state.match.episodeId) > 0
        )
      default:
        return false
    }
  }

  private executeCommand(
    cmd: Command,
    state: LoadingState,
    deps: ServiceDeps,
  ): Observable<PipelineEvent> {
    switch (cmd.type) {
      case 'loadFromUrl':
      case 'loadFromProvider':
      case 'loadFromFile':
      case 'loadFromPath':
        return this.executeFullLoad(cmd, deps)
      case 'cancel':
        return of({ type: 'cancelled' })
      case 'playNow':
        if (
          state.step === 'matching' ||
          state.step === 'loading_danmaku' ||
          state.step === 'waiting_user' ||
          state.step === 'match_failed'
        ) {
          return this.playNowLoad(state, deps)
        }
        return EMPTY
      case 'retryMatch':
        if (state.step === 'ready')
          return concat(
            of<PipelineEvent>({ type: 'backgroundStarted', phase: 'matching' }),
            this.backgroundMatch(state.video, deps),
          )
        return state.step === 'match_failed'
          ? concat(
              of<PipelineEvent>({ type: 'hashed', video: state.video }),
              this.matchAndLoad(state.video, deps),
            )
          : EMPTY
      case 'manualMatch':
        return state.step === 'match_failed'
          ? of({
              type: 'waitingUser',
              video: state.video,
              matchData: { isMatched: false, matches: [] },
            })
          : EMPTY
      case 'selectMatch':
        return state.step === 'waiting_user'
          ? concat(
              of<PipelineEvent>({ type: 'matched', match: cmd.match }),
              this.loadDanmakuAndFinish(cmd.match, state.video, deps),
            )
          : EMPTY
      case 'rematch':
      case 'retryDanmaku': {
        if (state.step !== 'ready') return EMPTY
        const target = cmd.type === 'rematch' ? cmd.match : (state.recovery?.target ?? state.match)
        return createRematchPipeline(target, state.video, deps, state.danmaku).pipe(
          catchError((error) =>
            of<PipelineEvent>({
              type: 'reloadFailed',
              target,
              message: error instanceof Error ? error.message : '弹幕加载失败',
            }),
          ),
        )
      }
      default:
        return EMPTY
    }
  }

  // ============================================================
  // 公开 API：命令式方法
  // ============================================================

  loadFromUrl(url: string, recordId?: string): void {
    this.command$.next({ type: 'loadFromUrl', url, recordId })
  }

  /** 从媒体源条目加载（媒体源浏览、播放列表、续播） */
  loadFromProvider(sourceId: string, itemRef: string): void {
    this.command$.next({ type: 'loadFromProvider', sourceId, itemRef })
  }

  /** 从 File 对象加载（拖拽/点击选择） */
  loadFromFile(file: File): void {
    this.command$.next({ type: 'loadFromFile', file })
  }

  /** 从文件路径加载（IPC/历史记录/播放列表切换） */
  loadFromPath(path: string): void {
    this.command$.next({ type: 'loadFromPath', path })
  }

  /** 用户在对话框中选择了匹配结果 */
  selectMatch(match: MatchedVideo): void {
    this.command$.next({ type: 'selectMatch', match })
  }

  /** 加载中提前开播：本次临时按优先播放处理，未完成的匹配与弹幕转入后台 */
  playNow(): void {
    this.command$.next({ type: 'playNow' })
  }

  /** 原地重试匹配，不重新读取视频。 */
  retryMatch(): void {
    this.command$.next({ type: 'retryMatch' })
  }

  /** 匹配接口失败后仍可打开手动搜索。 */
  manualMatch(): void {
    this.command$.next({ type: 'manualMatch' })
  }

  /** 仅重试当前剧集或上次失败的重新匹配目标。 */
  retryDanmaku(): void {
    this.afterSourceWrites({ type: 'retryDanmaku' })
  }

  /** 对当前 ready 数据重新匹配弹幕库 */
  rematch(match: MatchedVideo): void {
    this.afterSourceWrites({ type: 'rematch', match })
  }

  /** 重新匹配必须等已开始的来源事务落盘，避免旧数组覆盖新来源。 */
  private afterSourceWrites(command: Command) {
    const session = this.session
    if (!this.sourceWriteCount) {
      this.command$.next(command)
      return
    }
    void this.sourceWrites.then(() => {
      if (session === this.session) this.afterSourceWrites(command)
    })
  }

  async mutateDanmaku(
    update: (entries: DanmakuEntry[]) => DanmakuEntry[],
    expectedSession = this.session,
    signal?: AbortSignal,
  ): Promise<void> {
    this.sourceWriteCount++
    const isCurrent = () => this.session === expectedSession && !signal?.aborted
    const pending = this.sourceWrites
      .then(async () => {
        if (!isCurrent()) throw new Error('视频已切换或操作已取消')
        if (this.currentState.step === 'reloading') {
          await firstValueFrom(this.state$.pipe(filter((state) => state.step !== 'reloading')))
        }
        if (!isCurrent()) throw new Error('视频已切换或操作已取消')
        const state = this.currentState
        if (state.step !== 'ready') throw new Error('请先打开视频')
        const danmaku = update(state.danmaku)
        if (this.deps.cache.commit) {
          await this.deps.cache.commit(state.video.hash, danmaku, isCurrent)
        } else {
          // 非持久化 Port 的兼容路径；产品 IndexedDB 实现使用上面的事务提交。
          await this.deps.cache.set(state.video.hash, danmaku)
        }
        if (!isCurrent()) return
        const current = this.currentState
        if (current.step !== 'ready' || current.video !== state.video) return
        this.stateSubject.next({
          ...current,
          danmaku,
          mergedComments: mergeDanmakuEntries(danmaku),
        })
      })
      .finally(() => {
        this.sourceWriteCount--
      })
    this.sourceWrites = pending.catch(() => {})
    return pending
  }

  async addLocalDanmaku(entry: DanmakuEntry): Promise<void> {
    if (this.currentState.step !== 'ready') return
    return this.mutateDanmaku((entries) => [...entries, entry])
  }

  async addLinkDanmaku(
    entry: Extract<DanmakuEntry, { type: 'link' }>,
    session: number,
    signal: AbortSignal,
  ): Promise<void> {
    validateOffset(entry.offsetSeconds)
    return this.mutateDanmaku(
      (entries) => {
        if (entries.some((item) => item.source === entry.source))
          throw new Error('已经添加过该来源')
        return [...entries, entry]
      },
      session,
      signal,
    )
  }

  async setDanmakuSourceSelected(
    source: string,
    selected: boolean,
    session = this.session,
  ): Promise<void> {
    return this.mutateDanmaku(
      (entries) =>
        entries.map((entry) => (entry.source === source ? { ...entry, selected } : entry)),
      session,
    )
  }

  async setDanmakuSourceOffset(source: string, offset: number): Promise<void> {
    const offsetSeconds = validateOffset(offset)
    return this.mutateDanmaku((entries) =>
      entries.map((entry) =>
        entry.type === 'link' && entry.source === source ? { ...entry, offsetSeconds } : entry,
      ),
    )
  }

  /** 取消当前加载 */
  cancel(): void {
    this.command$.next({ type: 'cancel' })
  }

  /** 销毁 service（释放所有订阅） */
  destroy(): void {
    const state = this.currentState
    if ('video' in state && state.video?.hash)
      this.deps.importer.releaseImportedVideo?.(state.video as VideoInfo)
    this.operations.cancel()
    this.destroy$.next()
    this.destroy$.complete()
    this.subscription.unsubscribe()
    this.command$.complete()
  }

  // ============================================================
  // 内部 Pipeline 编排
  // ============================================================

  /**
   * 执行完整加载流程
   * 使用 concat + defer 保证步骤顺序执行
   * 通过闭包传递中间数据，不依赖 this.currentState 的时序
   */
  private executeFullLoad(
    cmd: Extract<
      Command,
      { type: 'loadFromFile' | 'loadFromPath' | 'loadFromUrl' | 'loadFromProvider' }
    >,
    deps: ServiceDeps,
  ): Observable<PipelineEvent> {
    let video: VideoInfo
    // 在命令开始时固化策略，播放中切换设置只影响下一次加载
    const playFirst = this.readPlayFirst(deps)
    return concat(
      of<PipelineEvent>({ type: 'started' }),
      defer(async () => {
        video =
          cmd.type === 'loadFromUrl'
            ? await deps.importer.importFromUrl!(cmd.url, cmd.recordId)
            : cmd.type === 'loadFromProvider'
              ? await deps.importer.importFromProvider!(cmd.sourceId, cmd.itemRef)
              : cmd.type === 'loadFromFile'
                ? await deps.importer.importFromFile(cmd.file)
                : await deps.importer.importFromPath(cmd.path)
        return { type: 'hashed' as const, video }
      }),
      defer(() => (playFirst ? this.playFirstLoad(video, deps) : this.matchAndLoad(video, deps))),
    )
  }

  private readPlayFirst(deps: ServiceDeps): boolean {
    try {
      return deps.policy?.playFirst() ?? false
    } catch {
      // 读取偏好失败按默认关闭处理，不影响加载
      return false
    }
  }

  /** 当前命令分支仍然有效：新命令会替换 activeDeps，切集/取消还会递增 session */
  private isActive(deps: ServiceDeps, session: number) {
    return this.activeDeps === deps && this.session === session
  }

  /**
   * 优先播放：只读本地匹配与缓存决定开播时带的数据，网络部分留在后台。
   * 后台段与开播事件处于同一个 Observable，新命令经 switchMap 切走时一并终止。
   */
  private playFirstLoad(video: VideoInfo, deps: ServiceDeps): Observable<PipelineEvent> {
    let known: MatchedVideo | undefined
    let phase: BackgroundPhase | undefined
    return concat(
      defer(async (): Promise<PipelineEvent> => {
        known = await this.readHistoryMatch(video, deps)
        const start = await this.prepareEarlyStart(video, deps, known, true)
        phase = start.phase
        return {
          type: 'playFirstReady',
          video,
          match: known ?? UNMATCHED,
          matchOrigin: known ? 'history' : undefined,
          danmaku: start.danmaku,
          mergedComments: mergeDanmakuEntries(start.danmaku),
          background: phase,
        }
      }),
      defer(() => this.continueInBackground(phase, known, 'history', video, deps)),
    )
  }

  /**
   * 加载中手动提前开播：等同于本次临时开启优先播放，从点击时的步骤接着在后台完成。
   * - matching：与优先播放相同，先看播放记录，没有再后台匹配
   * - loading_danmaku：沿用已得到的匹配，后台加载弹幕
   * - waiting_user / match_failed：已有结论，带着候选或错误开播，不再发起后台请求
   * 正在进行的请求会被 switchMap 中止，后台阶段重新发起，换取复用现有的切换与失效边界。
   */
  private playNowLoad(
    state: Extract<LoadingState, { step: PlayNowStep }>,
    deps: ServiceDeps,
  ): Observable<PipelineEvent> {
    const { video } = state
    const from = state.step
    let known = state.step === 'loading_danmaku' ? state.match : undefined
    let origin = state.step === 'loading_danmaku' ? (state.matchOrigin ?? 'auto') : undefined
    let phase: BackgroundPhase | undefined
    return concat(
      defer(async (): Promise<PipelineEvent> => {
        if (from === 'matching') {
          known = await this.readHistoryMatch(video, deps)
          origin = known ? 'history' : undefined
        }
        const start = await this.prepareEarlyStart(video, deps, known, from === 'matching')
        phase = start.phase
        return {
          type: 'playNowReady',
          from,
          video,
          match: known ?? UNMATCHED,
          matchOrigin: origin,
          danmaku: start.danmaku,
          mergedComments: mergeDanmakuEntries(start.danmaku),
          background: phase,
          candidates: state.step === 'waiting_user' ? state.matchData : undefined,
          matchError: state.step === 'match_failed' ? state.error : undefined,
        }
      }),
      defer(() => this.continueInBackground(phase, known, origin ?? 'auto', video, deps)),
    )
  }

  /** 播放记录中已确认的匹配；Operation 包装的读取失败会降级为空结果 */
  private async readHistoryMatch(
    video: VideoInfo,
    deps: ServiceDeps,
  ): Promise<MatchedVideo | undefined> {
    const history = await deps.history.get(video.hash)
    return history?.episodeId && history?.animeId
      ? {
          episodeId: history.episodeId,
          animeTitle: history.animeTitle || '',
          episodeTitle: history.episodeTitle || '',
          animeId: history.animeId,
        }
      : undefined
  }

  /**
   * 提前开播的本地部分：取可用弹幕、决定后台阶段并写入历史。
   * searchMatch 为 false 时没有匹配也不再后台匹配（已有未匹配或失败的结论）。
   */
  private async prepareEarlyStart(
    video: VideoInfo,
    deps: ServiceDeps,
    known: MatchedVideo | undefined,
    searchMatch: boolean,
  ): Promise<{ danmaku: DanmakuEntry[]; phase?: BackgroundPhase }> {
    const danmaku = await getAvailableDanmaku(video, deps, known)
    let phase: BackgroundPhase | undefined
    if (!known) {
      phase = searchMatch ? 'matching' : undefined
    } else {
      // 已有同一匹配的在线弹幕且缓存未过期时直接使用，不再后台请求
      const hasOnline = danmaku.some((entry) => entry.type === 'auto')
      const fresh = hasOnline && !(await deps.cache.isStale(video.hash))
      phase = fresh ? undefined : 'loading_danmaku'
    }
    // 开播即保存可恢复来源，开播后立刻关闭也能从历史重新打开
    await deps.history.save({
      hash: video.hash,
      source: getPersistentMediaSource(video),
      animeId: known?.animeId ?? 0,
      episodeId: known?.episodeId ?? 0,
      animeTitle: known?.animeTitle || video.name,
      episodeTitle: known?.episodeTitle ?? '',
      danmaku,
    })
    return { danmaku, phase }
  }

  /** 开播事件之后的后台段：有匹配则加载弹幕，否则后台匹配 */
  private continueInBackground(
    phase: BackgroundPhase | undefined,
    known: MatchedVideo | undefined,
    origin: 'auto' | 'history' | 'manual',
    video: VideoInfo,
    deps: ServiceDeps,
  ): Observable<PipelineEvent> {
    if (!phase) return EMPTY
    return known
      ? this.backgroundDanmaku(known, origin, video, deps)
      : this.backgroundMatch(video, deps)
  }

  /** 后台匹配：无精确结果或接口失败都停留在 ready，不打断播放 */
  private backgroundMatch(video: VideoInfo, deps: ServiceDeps): Observable<PipelineEvent> {
    const session = this.session
    return executeMatch(video, deps).pipe(
      map((event) => ({ event })),
      catchError((error) => of({ error })),
      switchMap((result): Observable<PipelineEvent> => {
        if ('error' in result) {
          // 已失效的分支（含 AbortError）静默结束，不产生失败提示
          if (!this.isActive(deps, session)) return EMPTY
          const { error } = result
          return of({
            type: 'backgroundMatchFailed',
            message: error instanceof Error ? error.message : '匹配失败',
          })
        }
        const { event } = result
        if (event.type === 'matched')
          return concat(
            of<PipelineEvent>({ type: 'backgroundPhase', phase: 'loading_danmaku' }),
            this.backgroundDanmaku(event.match, event.matchOrigin ?? 'auto', video, deps),
          )
        if (event.type === 'waitingUser')
          return of({ type: 'backgroundUnmatched', candidates: event.matchData })
        return EMPTY
      }),
    )
  }

  /** 后台弹幕：请求失败沿用已有弹幕，结果统一经来源写入队列提交 */
  private backgroundDanmaku(
    match: MatchedVideo,
    matchOrigin: 'auto' | 'history' | 'manual',
    video: VideoInfo,
    deps: ServiceDeps,
  ): Observable<PipelineEvent> {
    const session = this.session
    return defer(async () => {
      let content: CommentsData | undefined
      try {
        content = await deps.api.getDanmu(match.episodeId, { withRelated: true })
      } catch (error) {
        // 被新命令切走时请求会被中止，此时不能把中止当成失败提交
        if (!this.isActive(deps, session)) return
        console.error('后台加载弹幕失败:', error)
      }
      if (!this.isActive(deps, session)) return
      await this.commitBackground(deps, session, video, match, matchOrigin, content)
    }).pipe(ignoreElements())
  }

  /**
   * 后台结果在来源写入队列中提交：基于提交时的当前弹幕合并，
   * 保证后台请求期间导入的本地弹幕和来源开关不被开播时的快照覆盖。
   */
  private commitBackground(
    deps: ServiceDeps,
    session: number,
    video: VideoInfo,
    match: MatchedVideo,
    matchOrigin: 'auto' | 'history' | 'manual',
    content: CommentsData | undefined,
  ): Promise<void> {
    this.sourceWriteCount++
    const isCurrent = () => this.isActive(deps, session)
    const isPending = () => {
      const state = this.currentState
      return state.step === 'ready' && state.video === video && !!state.background
    }
    const pending = this.sourceWrites
      .then(async () => {
        if (!isCurrent() || !isPending()) return
        const state = this.currentState as Extract<LoadingState, { step: 'ready' }>
        let danmaku = state.danmaku
        if (content) {
          const selected =
            state.danmaku.find((entry) => entry.type === 'auto' && entry.source === 'dandanplay')
              ?.selected ?? true
          danmaku = [
            { type: 'auto', source: 'dandanplay', content, selected },
            ...state.danmaku.filter((entry) => entry.type !== 'auto'),
          ]
        }
        try {
          // 匹配已确认即写入历史，下次打开直接使用本地匹配
          await deps.history.save({
            hash: video.hash,
            source: getPersistentMediaSource(video),
            animeId: match.animeId,
            episodeId: match.episodeId,
            animeTitle: match.animeTitle,
            episodeTitle: match.episodeTitle,
            danmaku,
          })
          if (content) {
            if (deps.cache.commit) await deps.cache.commit(video.hash, danmaku, isCurrent)
            else await deps.cache.set(video.hash, danmaku)
          }
        } catch (error) {
          // 持久化失败不影响本次会话接入弹幕，也不误报为上游请求失败
          if (isCurrent()) console.error('保存后台弹幕失败:', error)
        }
        if (!isCurrent() || !isPending()) return
        this.applyEvent({
          type: 'backgroundSettled',
          match,
          matchOrigin,
          danmaku,
          mergedComments: mergeDanmakuEntries(danmaku),
          danmakuLoadFailed: !content,
        })
      })
      .finally(() => {
        this.sourceWriteCount--
      })
    this.sourceWrites = pending.catch(() => {})
    return pending
  }

  /** 队列内的提交直接推进状态，避免与其他来源写入在微任务间交错 */
  private applyEvent(event: PipelineEvent) {
    this.stateSubject.next(reduce(this.currentState, event))
  }

  private matchAndLoad(video: VideoInfo, deps: ServiceDeps): Observable<PipelineEvent> {
    return concat(
      executeMatch(video, deps).pipe(
        catchError((error) =>
          of<PipelineEvent>({
            type: 'matchFailed',
            video,
            message: error instanceof Error ? error.message : '匹配失败',
          }),
        ),
      ),
      defer(() => {
        const state = this.currentState
        return state.step === 'loading_danmaku'
          ? this.loadDanmakuAndFinish(state.match, video, deps)
          : EMPTY
      }),
    )
  }

  /** 请求失败保留可用弹幕；持久化失败由操作边界独立降级。 */
  private loadDanmakuAndFinish(
    match: MatchedVideo,
    video: VideoInfo,
    deps: ServiceDeps,
  ): Observable<PipelineEvent> {
    return executeFetchDanmaku(match, video, deps).pipe(
      catchError(() =>
        defer(async (): Promise<PipelineEvent> => {
          const danmaku = await getAvailableDanmaku(video, deps, match)
          return {
            type: 'danmakuLoaded',
            danmakuLoadFailed: true,
            danmaku,
            mergedComments: mergeDanmakuEntries(danmaku),
          }
        }),
      ),
      switchMap((event) => {
        if (event.type !== 'danmakuLoaded') return of(event)
        return executeFinish(video, match, event.danmaku, event.mergedComments, deps).pipe(
          map((finished) =>
            finished.type === 'danmakuLoaded'
              ? { ...finished, danmakuLoadFailed: event.danmakuLoadFailed }
              : finished,
          ),
        )
      }),
    )
  }
}
