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

import type {Observable, Subscription} from 'rxjs';
import type {
  Command,
  DanmakuEntry,
  LoadingState,
  MatchedVideo,
  PipelineEvent,
  PlayerBridge,
  ServiceDeps,
  VideoInfo,
} from './types'
import {
  BehaviorSubject,
  concat,
  defer,
  EMPTY,
  merge,
  
  of,
  Subject
  
} from 'rxjs'

import {
  catchError,
  exhaustMap,
  filter,
  map,
  switchMap,
  takeUntil,
} from 'rxjs/operators'
import {
  executeFetchDanmaku,
  executeFinish,
  executeMatch,
  waitForUserSelection,
} from './pipelines/load'
import { addLocalDanmakuEntry, createRematchPipeline } from './pipelines/rematch'
import { INITIAL_STATE, reduce } from './state-machine'

export class PlayerLoadingService {
  // 命令输入流
  private command$ = new Subject<Command>()
  // 销毁信号
  private destroy$ = new Subject<void>()
  // 播放器桥接（播放中热更新弹幕用）
  private playerBridge: PlayerBridge | null = null
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

    // 主加载流：loadFromFile/loadFromPath 用 switchMap（新 load 自动取消旧的）
    const loadPipeline$ = this.command$.pipe(
      filter((cmd): cmd is Extract<Command, { type: 'loadFromFile' | 'loadFromPath' }> =>
        cmd.type === 'loadFromFile' || cmd.type === 'loadFromPath',
      ),
      switchMap((cmd) => this.executeFullLoad(cmd).pipe(
        catchError((err) => {
          const message = err instanceof Error ? err.message : '加载失败'
          return of<PipelineEvent>({ type: 'error', message, previousStep: this.currentState.step })
        }),
      )),
    )

    // 播放中重新匹配：exhaustMap 防止重复点击
    const rematchPipeline$ = this.command$.pipe(
      filter((cmd): cmd is Extract<Command, { type: 'rematch' }> => cmd.type === 'rematch'),
      filter(() => this.currentState.step === 'playing'),
      exhaustMap((cmd) => {
        const state = this.currentState
        if (state.step !== 'playing') return EMPTY
        return createRematchPipeline(cmd.match, state.video, this.deps, this.playerBridge).pipe(
          catchError((err) => {
            const message = err instanceof Error ? err.message : '重新匹配失败'
            return of<PipelineEvent>({ type: 'error', message, previousStep: 'reloading' })
          }),
        )
      }),
    )

    // 取消命令
    const cancelPipeline$ = this.command$.pipe(
      filter((cmd) => cmd.type === 'cancel'),
      map((): PipelineEvent => ({ type: 'cancelled' })),
    )

    // 合并所有 pipeline 的事件，通过 reduce 更新状态
    this.subscription = merge(loadPipeline$, rematchPipeline$, cancelPipeline$).pipe(
      takeUntil(this.destroy$),
    ).subscribe((event) => {
      const newState = reduce(this.stateSubject.value, event)
      this.stateSubject.next(newState)
    })
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

  /** 播放中重新匹配弹幕库 */
  rematch(match: MatchedVideo): void {
    this.command$.next({ type: 'rematch', match })
  }

  /** 播放中添加本地弹幕 */
  async addLocalDanmaku(entry: DanmakuEntry): Promise<void> {
    const state = this.currentState
    if (state.step !== 'playing') return

    const result = await addLocalDanmakuEntry(
      entry,
      state.danmaku,
      state.video,
      this.deps,
      this.playerBridge,
    )

    // 直接更新状态（不经过 pipeline event，因为这是同步操作）
    this.stateSubject.next({
      ...state,
      danmaku: result.danmaku,
      mergedComments: result.mergedComments,
    })
  }

  /** 取消当前加载 */
  cancel(): void {
    this.command$.next({ type: 'cancel' })
  }

  /** 连接播放器桥接（播放器初始化后调用） */
  connectPlayer(bridge: PlayerBridge): void {
    this.playerBridge = bridge
  }

  /** 断开播放器桥接（播放器销毁时调用） */
  disconnectPlayer(): void {
    this.playerBridge = null
  }

  /** 销毁 service（释放所有订阅） */
  destroy(): void {
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
  ): Observable<PipelineEvent> {
    // 用闭包保存中间数据，避免依赖 stateSubject 的更新时序
    let video: VideoInfo

    return concat(
      // Step 1: 开始
      of<PipelineEvent>({ type: 'started' }),

      // Step 2: 导入视频并计算 hash
      defer(async () => {
        video =
          cmd.type === 'loadFromFile'
            ? await this.deps.importer.importFromFile(cmd.file)
            : await this.deps.importer.importFromPath(cmd.path)
        return { type: 'hashed' as const, video }
      }) as Observable<PipelineEvent>,

      // Step 3: 匹配动漫
      defer(() => executeMatch(video, this.deps)),

      // Step 4: 根据匹配结果决定下一步
      defer(() => {
        const state = this.currentState

        // 精准匹配 → 直接加载弹幕
        if (state.step === 'loading_danmaku') {
          return this.loadDanmakuAndFinish(state.match, video)
        }

        // 未匹配 → 等待用户选择
        if (state.step === 'waiting_user') {
          return waitForUserSelection(this.command$).pipe(
            switchMap((userCmd) => {
              if (userCmd.type === 'skipDanmaku') {
                return this.handleSkipDanmaku(video)
              }
              if (userCmd.type === 'selectMatch') {
                return concat(
                  of<PipelineEvent>({ type: 'matched', match: userCmd.match }),
                  defer(() => this.loadDanmakuAndFinish(userCmd.match, video)),
                )
              }
              return EMPTY
            }),
          )
        }

        return EMPTY
      }),
    )
  }

  /**
   * 加载弹幕并完成：fetch danmaku → save history → ready → playing
   * 弹幕获取失败时降级为无弹幕播放（不阻塞播放）
   */
  private loadDanmakuAndFinish(match: MatchedVideo, video: VideoInfo): Observable<PipelineEvent> {
    return concat(
      executeFetchDanmaku(match, video, this.deps).pipe(
        catchError((err) => {
          console.error('弹幕获取失败，降级为无弹幕播放:', err)
          // 降级：返回空弹幕数据，继续播放
          return of<PipelineEvent>({
            type: 'danmakuLoaded',
            danmaku: [],
            mergedComments: [],
          })
        }),
      ),
      defer(() => {
        const s = this.currentState
        if (s.step !== 'ready') return EMPTY
        return executeFinish(s.video, s.match, s.danmaku, this.deps)
      }),
    )
  }

  /**
   * 跳过弹幕：只加载本地弹幕，直接进入播放
   */
  private handleSkipDanmaku(video: VideoInfo): Observable<PipelineEvent> {
    return defer(async () => {
      const cached = await this.deps.cache.get(video.hash)
      const localDanmaku = cached?.filter((d) => d.type === 'local') ?? []

      // 保存历史（无弹幕匹配信息）
      await this.deps.history.save({
        hash: video.hash,
        path: video.url,
        animeTitle: video.name,
        danmaku: localDanmaku.length > 0 ? localDanmaku : undefined,
      })

      return { type: 'playing' as const }
    }) as Observable<PipelineEvent>
  }
}
