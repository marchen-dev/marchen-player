import type {
  MediaGenerationSnapshot,
  MediaSessionEvent,
  PlaybackMode,
} from '@marchen/shared/media'

export interface GenerationSpan {
  setAttributes: (attributes: Record<string, string | number | boolean | undefined>) => void
  end: () => void
}

export interface GenerationSpanSink {
  start: (options: {
    name: string
    op: string
    attributes: Record<string, string | number | boolean>
  }) => GenerationSpan
}

interface ActiveGeneration {
  startedAt: number
  firstReadyAt?: number
  latest: MediaGenerationSnapshot
  span: GenerationSpan
}

const terminalStatuses = new Set<MediaGenerationSnapshot['status']>([
  'finished',
  'failed',
  'cancelled',
])

/** Main 只保留每个 FFmpeg generation 的一个汇总 span，不产生逐分片事件。 */
export class MediaGenerationTelemetryObserver {
  #active = new Map<number, ActiveGeneration>()

  constructor(
    private readonly mode: Exclude<PlaybackMode, 'direct'>,
    private readonly sink: GenerationSpanSink,
    private readonly now: () => number = () => Date.now(),
  ) {}

  observe(event: MediaSessionEvent) {
    if (event.type !== 'generation-changed') return
    const snapshot = event.generation
    let active = this.#active.get(snapshot.generation)
    if (!active) {
      active = {
        startedAt: this.now(),
        latest: snapshot,
        span: this.sink.start({
          name: 'FFmpeg media generation',
          op: 'media.generation',
          attributes: {
            mode: this.mode,
            generation: snapshot.generation,
            requested_start_time: snapshot.requestedStartTime,
          },
        }),
      }
      this.#active.set(snapshot.generation, active)
    }
    active.latest = snapshot
    if (snapshot.actualFirstTimestamp !== undefined && active.firstReadyAt === undefined) {
      active.firstReadyAt = this.now()
    }
    if (!terminalStatuses.has(snapshot.status)) return

    active.span.setAttributes({
      mode: this.mode,
      generation: snapshot.generation,
      encoder_class: snapshot.encoderClass,
      segment_count: snapshot.segmentCount,
      produced_duration_s: snapshot.producedDuration,
      bytes_written: snapshot.bytesWritten,
      startup_ms: (active.firstReadyAt ?? this.now()) - active.startedAt,
      end_reason: snapshot.status,
    })
    active.span.end()
    this.#active.delete(snapshot.generation)
  }

  dispose() {
    for (const active of this.#active.values()) {
      active.span.setAttributes({
        mode: this.mode,
        generation: active.latest.generation,
        encoder_class: active.latest.encoderClass,
        segment_count: active.latest.segmentCount,
        produced_duration_s: active.latest.producedDuration,
        bytes_written: active.latest.bytesWritten,
        startup_ms: (active.firstReadyAt ?? this.now()) - active.startedAt,
        end_reason: 'cancelled',
      })
      active.span.end()
    }
    this.#active.clear()
  }
}
