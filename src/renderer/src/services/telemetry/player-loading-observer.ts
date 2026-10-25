import type { LoadingState, PlayerLoadingService } from '@marchen/player-loading'
import type { Subscription } from 'rxjs'

import type { LoadMode, TelemetryEventMap, TelemetryEventName, TelemetrySpan } from './contracts'
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
  finishOperationSpan: () => void
  finishMatchSpan?: () => void
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
        container: containerFromName(state.video.name),
      })
      active.finishMatchSpan = deferredSpan(this.sink, {
        name: 'danmaku match and load',
        op: 'player.danmaku',
        attributes: { operation_id: active.id },
      })
    }

    if (state.step === 'waiting_user') active.waitedForUser = true

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
      this.#completeMatch(active, state)
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

    if (state.step === 'idle') this.#cancelActive()
  }

  /** 后台阶段的 ready→ready 变化不经过 step 去重，需要单独判断结束时机 */
  #observeBackground(active: ActiveLoadingOperation, state: LoadingState) {
    if (state.step === 'ready') {
      if (!state.background) this.#completeMatch(active, state)
      return
    }
    // 后台未结束就被用户的重新匹配接管或取消（新加载在 importing 分支处理），按取消记录
    this.#cancelActive()
  }

  #completeMatch(active: ActiveLoadingOperation, state: Extract<LoadingState, { step: 'ready' }>) {
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

  #cancelActive() {
    const active = this.#active
    if (!active) return
    if (active.importCompleted) {
      this.sink.capture('danmaku_match_completed', {
        operation_id: active.id,
        load_mode: active.loadMode,
        result: 'cancelled',
        duration_ms: this.now() - active.startedAt,
      })
    }
    this.#finishActive()
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

  return service.state$.subscribe((state) => observer.observe(state))
}
