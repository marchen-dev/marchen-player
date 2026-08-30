import type { LoadingState, PlayerLoadingService } from '@marchen/player-loading'
import type { Subscription } from 'rxjs'

import type { TelemetryEventMap, TelemetryEventName, TelemetrySpan } from './contracts'
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
      const skipped = state.match.episodeId === 0
      this.sink.capture('danmaku_match_completed', {
        operation_id: active.id,
        result: skipped ? 'none' : active.waitedForUser ? 'manual' : 'automatic',
        duration_ms: this.now() - active.startedAt,
        comment_count: state.mergedComments.length,
      })
      this.#finishActive()
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

  #cancelActive() {
    const active = this.#active
    if (!active) return
    if (active.importCompleted) {
      this.sink.capture('danmaku_match_completed', {
        operation_id: active.id,
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

export const installPlayerLoadingTelemetry = (service: PlayerLoadingService): Subscription => {
  const observer = new PlayerLoadingTelemetryObserver()
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
