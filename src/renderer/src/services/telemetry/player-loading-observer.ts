import type { LoadingState, PlayerLoadingService } from '@marchen/player-loading'
import type { Subscription } from 'rxjs'

import type {
  LoadingExitStep,
  LoadMode,
  MediaKind,
  TelemetryEventMap,
  TelemetryEventName,
  TelemetrySpan,
} from './contracts'
import { telemetry } from './client'

export type VideoImportSource = TelemetryEventMap['video_import_started']['source']

interface LoadingTelemetrySink {
  capture: <E extends TelemetryEventName>(name: E, properties: TelemetryEventMap[E]) => void
  breadcrumb: (step: LoadingState['step'], operationId: string) => void
  startSpan: (span: TelemetrySpan, run: () => Promise<void>) => void
}

const defaultSink: LoadingTelemetrySink = {
  capture: (name, properties) => telemetry.capture(name, properties),
  breadcrumb: (step, operationId) =>
    telemetry.addBreadcrumb({
      category: 'player.loading',
      message: step,
      data: { operation_id: operationId },
    }),
  startSpan: (span, run) => void telemetry.startSpan(span, run),
}

interface ActiveLoadingOperation {
  id: string
  source: VideoImportSource
  startedAt: number
  importCompleted: boolean
  waitedForUser: boolean
  loadMode: LoadMode
  /** 优先播放已开播、弹幕仍在后台：等后台结束才记录匹配结果 */
  awaitingBackground: boolean
  lastStep?: LoadingState['step']
  /** 当前所处的可计时阶段；优先播放的后台阶段也映射到 matching / loading_danmaku */
  phase?: LoadingExitStep
  phaseEnteredAt: number
  /** 各阶段累计停留时长，重新匹配等回退路径会多次进入同一阶段 */
  phaseMs: Partial<Record<LoadingExitStep, number>>
  /** 最近一次非精确匹配给出的候选数 */
  candidateCount?: number
  finishOperationSpan: () => void
  finishMatchSpan?: () => void
}

const EXIT_STEPS = new Set<LoadingState['step']>([
  'hashing',
  'matching',
  'waiting_user',
  'match_failed',
  'loading_danmaku',
])

/** 把状态映射为可计时阶段：ready 只有在优先播放后台仍在进行时才算阶段 */
const phaseOf = (state: LoadingState): LoadingExitStep | undefined => {
  if (state.step === 'ready') return state.background?.phase
  return EXIT_STEPS.has(state.step) ? (state.step as LoadingExitStep) : undefined
}

const deferredSpan = (sink: LoadingTelemetrySink, span: TelemetrySpan) => {
  let finish = () => {}
  sink.startSpan(span, () => new Promise<void>((resolve) => void (finish = resolve)))
  return () => finish()
}

const containerFromName = (name: string) => {
  const extension = name.split('.').at(-1)?.toLowerCase()
  return extension && extension !== name.toLowerCase() ? extension : undefined
}

/**
 * 只观察 player-loading 的公开状态，不把供应商依赖放进纯状态机包。
 * 每个 command 创建一个 operation，状态门禁保证 Strict Effects、ready 重发和取消迟到值不重复计数。
 */
export class PlayerLoadingTelemetryObserver {
  #active?: ActiveLoadingOperation
  #nextSource: VideoImportSource = 'association'

  constructor(
    private readonly sink: LoadingTelemetrySink = defaultSink,
    private readonly now: () => number = () => Date.now(),
    private readonly createId: () => string = () => crypto.randomUUID(),
    // 与 service 在同一命令时刻读取偏好，保证口径与实际加载策略一致
    private readonly readPlayFirst: () => boolean = () => false,
  ) {}

  noteCommand(source: VideoImportSource) {
    this.#nextSource = source
  }

  observe(state: LoadingState) {
    if (state.step === 'importing') {
      if (this.#active?.lastStep === 'importing') return
      this.#cancelActive()
      const id = this.createId()
      const source = this.#nextSource
      this.#nextSource = 'association'
      this.#active = {
        id,
        source,
        startedAt: this.now(),
        importCompleted: false,
        waitedForUser: false,
        loadMode: this.#readLoadMode(),
        awaitingBackground: false,
        lastStep: 'importing',
        phaseEnteredAt: this.now(),
        phaseMs: {},
        finishOperationSpan: deferredSpan(this.sink, {
          name: 'video import and danmaku match',
          op: 'player.loading',
          attributes: { operation_id: id, source },
        }),
      }
      this.sink.capture('video_import_started', { operation_id: id, source })
      this.sink.breadcrumb('importing', id)
      return
    }

    const active = this.#active
    if (active?.awaitingBackground) {
      this.#observeBackground(active, state)
      return
    }
    if (!active || active.lastStep === state.step) return
    active.lastStep = state.step
    // 先结算上一阶段，后续 hash_ms 与跳过来源都依赖结算前的阶段
    const previousPhase = active.phase
    this.#enterPhase(active, phaseOf(state))
    this.sink.breadcrumb(state.step, active.id)

    if (
      !active.importCompleted &&
      'video' in state &&
      state.video.hash &&
      typeof state.video.name === 'string'
    ) {
      active.importCompleted = true
      latestOperation = { id: active.id, hash: state.video.hash }
      this.sink.capture('video_import_completed', {
        operation_id: active.id,
        load_mode: active.loadMode,
        duration_ms: this.now() - active.startedAt,
        media_kind: mediaKindOf(state.video.source?.kind),
        container: containerFromName(state.video.name),
        hash_ms: active.phaseMs.hashing,
      })
      active.finishMatchSpan = deferredSpan(this.sink, {
        name: 'danmaku match and load',
        op: 'player.danmaku',
        attributes: { operation_id: active.id },
      })
    }

    if (state.step === 'waiting_user') {
      active.waitedForUser = true
      active.candidateCount = state.matchData.matches.length
    }

    if (state.step === 'ready') {
      this.sink.capture('playback_ready', {
        operation_id: active.id,
        load_mode: active.loadMode,
        duration_ms: this.now() - active.startedAt,
        has_danmaku: state.mergedComments.length > 0,
      })
      if (state.background) {
        active.awaitingBackground = true
        return
      }
      this.#completeMatch(active, state, previousPhase)
      return
    }

    if (state.step === 'error') {
      this.sink.capture('video_import_failed', {
        operation_id: active.id,
        error_code: `player-loading-${state.error.previousStep}`,
        duration_ms: this.now() - active.startedAt,
      })
      this.#finishActive()
      return
    }

    // 进入 idle 时阶段已结算，取消记录要用离开前的阶段
    if (state.step === 'idle') this.#cancelActive(previousPhase)
  }

  /** 后台阶段的 ready→ready 变化不经过 step 去重，需要单独判断结束时机 */
  #observeBackground(active: ActiveLoadingOperation, state: LoadingState) {
    if (state.step === 'ready') {
      const previousPhase = active.phase
      const next = phaseOf(state)
      if (next !== previousPhase) this.#enterPhase(active, next)
      if (!state.background) this.#completeMatch(active, state, previousPhase)
      return
    }
    // 后台未结束就被用户的重新匹配接管或取消（新加载在 importing 分支处理），按取消记录
    this.#cancelActive()
  }

  #completeMatch(
    active: ActiveLoadingOperation,
    state: Extract<LoadingState, { step: 'ready' }>,
    exitStep: LoadingExitStep | undefined,
  ) {
    // background 存在时 episodeId 为 0 表示仍在匹配；此处 background 已结束，可按未匹配判断
    const result =
      state.danmakuStatus === 'unmatched'
        ? 'unmatched'
        : state.matchError
          ? 'failed'
          : state.match.episodeId === 0
            ? 'none'
            : active.waitedForUser
              ? 'manual'
              : 'automatic'
    this.sink.capture('danmaku_match_completed', {
      operation_id: active.id,
      load_mode: active.loadMode,
      result,
      duration_ms: this.now() - active.startedAt,
      comment_count: state.mergedComments.length,
      // 只有用户主动跳过才记录来源；播放记录里本就没有匹配的 none 不算跳过
      skip_from_step: state.danmakuStatus === 'skipped' ? exitStep : undefined,
      candidate_count: state.matchCandidates?.matches.length ?? active.candidateCount,
      match_origin: state.matchOrigin,
      ...this.#phaseDurations(active),
    })
    this.#finishActive()
  }

  #readLoadMode(): LoadMode {
    try {
      return this.readPlayFirst() ? 'play_first' : 'complete'
    } catch {
      return 'complete'
    }
  }

  #cancelActive(exitStep = this.#active?.phase) {
    const active = this.#active
    if (!active) return
    if (active.importCompleted) {
      this.#enterPhase(active, undefined)
      this.sink.capture('danmaku_match_completed', {
        operation_id: active.id,
        load_mode: active.loadMode,
        result: 'cancelled',
        duration_ms: this.now() - active.startedAt,
        skip_from_step: exitStep,
        candidate_count: active.candidateCount,
        ...this.#phaseDurations(active),
      })
    }
    this.#finishActive()
  }

  /** 结算当前阶段的停留时长并切换到下一阶段 */
  #enterPhase(active: ActiveLoadingOperation, next: LoadingExitStep | undefined) {
    const now = this.now()
    if (active.phase) {
      active.phaseMs[active.phase] =
        (active.phaseMs[active.phase] ?? 0) + now - active.phaseEnteredAt
    }
    active.phase = next
    active.phaseEnteredAt = now
  }

  /** 只输出经过的阶段，未经过的字段保持缺省，查询时与旧客户端一样按空值处理 */
  #phaseDurations(active: ActiveLoadingOperation) {
    return {
      matching_ms: active.phaseMs.matching,
      user_wait_ms: active.phaseMs.waiting_user,
      danmaku_load_ms: active.phaseMs.loading_danmaku,
    }
  }

  #finishActive() {
    this.#active?.finishMatchSpan?.()
    this.#active?.finishOperationSpan()
    this.#active = undefined
  }
}

let nextImportSource: VideoImportSource | undefined
let latestOperation: { id: string; hash: string } | undefined

export const getPlayerOperationId = (hash: string): string | undefined =>
  latestOperation?.hash === hash ? latestOperation.id : undefined

/** 在调用 service 命令前覆盖一次默认来源，下一条命令消费后自动清空。 */
export const markNextPlayerImportSource = (source: VideoImportSource) => {
  nextImportSource = source
}

export const installPlayerLoadingTelemetry = (
  service: PlayerLoadingService,
  readPlayFirst?: () => boolean,
): Subscription => {
  const observer = new PlayerLoadingTelemetryObserver(
    undefined,
    undefined,
    undefined,
    readPlayFirst,
  )
  const loadFromFile = service.loadFromFile.bind(service)
  const loadFromPath = service.loadFromPath.bind(service)

  service.loadFromFile = (file) => {
    observer.noteCommand(nextImportSource ?? 'drop')
    nextImportSource = undefined
    loadFromFile(file)
  }
  service.loadFromPath = (path) => {
    observer.noteCommand(nextImportSource ?? 'association')
    nextImportSource = undefined
    loadFromPath(path)
  }
  const loadFromProvider = service.loadFromProvider.bind(service)
  service.loadFromProvider = (sourceId, itemRef) => {
    observer.noteCommand(nextImportSource ?? 'media_source')
    nextImportSource = undefined
    loadFromProvider(sourceId, itemRef)
  }

  return service.state$.subscribe((state) => observer.observe(state))
}

const MEDIA_KINDS: Record<string, MediaKind> = {
  'electron-file': 'local',
  'web-file': 'web_file',
  'remote-url': 'remote_url',
  'provider-item': 'media_source',
}

/** 未知或缺失的来源类型不上报，避免把新类型误记成已有类型 */
const mediaKindOf = (kind: string | undefined): MediaKind | undefined =>
  kind ? MEDIA_KINDS[kind] : undefined
