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
  Command,
  DanmakuEntry,
  LoadingState,
  MatchedVideo,
  PipelineEvent,
  ServiceDeps,
  VideoInfo,
} from './types'
import { BehaviorSubject, concat, defer, EMPTY, of, Subject } from 'rxjs'
import { catchError, filter, map, switchMap, takeUntil } from 'rxjs/operators'

import { LoadingOperations } from './operation'
import {
  executeFetchDanmaku,
  executeFinish,
  executeMatch,
  getAvailableDanmaku,
} from './pipelines/load'
import { addLocalDanmakuEntry, createRematchPipeline } from './pipelines/rematch'
import { INITIAL_STATE, mergeDanmakuEntries, reduce } from './state-machine'
import { getPersistentMediaSource } from './types'

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
          const state = this.currentState
          const operationDeps = this.operations.start(this.deps)
          this.activeDeps = operationDeps
          return this.executeCommand(cmd, state, operationDeps).pipe(
            catchError((err) =>
              of<PipelineEvent>({
                type: 'error',
                message: err instanceof Error ? err.message : '加载失败',
                previousStep: this.currentState.step,
              }),
            ),
          )
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((event) => {
        this.stateSubject.next(reduce(this.stateSubject.value, event))
      })
  }

  private operations = new LoadingOperations()
  private activeDeps?: ServiceDeps

  private canExecute(cmd: Command): boolean {
    const state = this.currentState
    switch (cmd.type) {
      case 'loadFromFile':
      case 'loadFromPath':
      case 'cancel':
        return true
      case 'skipDanmaku':
        return ['matching', 'loading_danmaku', 'waiting_user', 'match_failed'].includes(state.step)
      case 'retryMatch':
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
      case 'loadFromFile':
      case 'loadFromPath':
        return this.executeFullLoad(cmd, deps)
      case 'cancel':
        return of({ type: 'cancelled' })
      case 'skipDanmaku':
        if (
          state.step === 'matching' ||
          state.step === 'loading_danmaku' ||
          state.step === 'waiting_user' ||
          state.step === 'match_failed'
        ) {
          return this.handleSkipDanmaku(state, deps)
        }
        return EMPTY
      case 'retryMatch':
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

  /** 用户选择跳过弹幕 */
  skipDanmaku(): void {
    this.command$.next({ type: 'skipDanmaku' })
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
    this.command$.next({ type: 'retryDanmaku' })
  }

  /** 对当前 ready 数据重新匹配弹幕库 */
  rematch(match: MatchedVideo): void {
    this.command$.next({ type: 'rematch', match })
  }

  /** 为当前 ready 数据添加本地弹幕 */
  async addLocalDanmaku(entry: DanmakuEntry): Promise<void> {
    const state = this.currentState
    if (state.step !== 'ready') return

    const result = await addLocalDanmakuEntry(
      entry,
      state.danmaku,
      state.video,
      this.activeDeps ?? this.deps,
    )

    // 持久化期间切换了视频或状态时，保留原视频缓存，但不能恢复旧会话。
    if (this.currentState !== state) return

    // 直接更新状态（不经过 pipeline event，因为这是同步操作）
    this.stateSubject.next({
      ...state,
      danmaku: result.danmaku,
      mergedComments: result.mergedComments,
    })
  }

  /** 切换当前弹幕源是否参与合并，并发布新的 ready 数据。 */
  async setDanmakuSourceSelected(source: string, selected: boolean): Promise<void> {
    const state = this.currentState
    if (state.step !== 'ready') return

    let changed = false
    const danmaku = state.danmaku.map((entry) => {
      if (entry.source !== source || entry.selected === selected) return entry
      changed = true
      return { ...entry, selected }
    })
    if (!changed) return

    const deps = this.activeDeps ?? this.deps
    await deps.cache.set(state.video.hash, danmaku)
    await deps.history.save({
      hash: state.video.hash,
      danmaku,
    })

    if (this.currentState !== state) return
    this.stateSubject.next({
      ...state,
      danmaku,
      mergedComments: mergeDanmakuEntries(danmaku),
    })
  }

  /** 取消当前加载 */
  cancel(): void {
    this.command$.next({ type: 'cancel' })
  }

  /** 销毁 service（释放所有订阅） */
  destroy(): void {
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
    cmd: Extract<Command, { type: 'loadFromFile' | 'loadFromPath' }>,
    deps: ServiceDeps,
  ): Observable<PipelineEvent> {
    let video: VideoInfo
    return concat(
      of<PipelineEvent>({ type: 'started' }),
      defer(async () => {
        video =
          cmd.type === 'loadFromFile'
            ? await deps.importer.importFromFile(cmd.file)
            : await deps.importer.importFromPath(cmd.path)
        return { type: 'hashed' as const, video }
      }),
      defer(() => this.matchAndLoad(video, deps)),
    )
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

  private handleSkipDanmaku(
    state: Extract<
      LoadingState,
      { step: 'matching' | 'loading_danmaku' | 'waiting_user' | 'match_failed' }
    >,
    deps: ServiceDeps,
  ): Observable<PipelineEvent> {
    return defer(async () => {
      const { video } = state
      const match = state.step === 'loading_danmaku' ? state.match : undefined
      const danmaku = await getAvailableDanmaku(video, deps, match)
      await deps.history.save({
        hash: video.hash,
        source: getPersistentMediaSource(video),
        animeId: match?.animeId ?? 0,
        episodeId: match?.episodeId ?? 0,
        animeTitle: match?.animeTitle || video.name,
        episodeTitle: match?.episodeTitle ?? '',
        danmaku,
      })
      return {
        type: 'skipped' as const,
        video,
        danmaku,
        mergedComments: mergeDanmakuEntries(danmaku),
      }
    })
  }
}
