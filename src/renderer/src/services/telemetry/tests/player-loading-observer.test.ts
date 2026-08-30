import type { LoadingState } from '@marchen/player-loading'
import type { TelemetryEventMap, TelemetryEventName } from '../contracts'

import { describe, expect, it, vi } from 'vitest'
import { PlayerLoadingTelemetryObserver } from '../player-loading-observer'

const video = {
  source: {
    kind: 'electron-file' as const,
    path: '/private/anime.mkv',
    hash: 'hash',
    name: 'anime.mkv',
    size: 1,
  },
  hash: 'hash',
  name: 'anime.MKV',
  size: 1,
  playList: [],
}
const match = { episodeId: 1, animeId: 2, animeTitle: 'anime', episodeTitle: 'episode' }

const createHarness = () => {
  const events: Array<{ name: TelemetryEventName; properties: object }> = []
  let now = 1_000
  const finishes: Array<() => void> = []
  const observer = new PlayerLoadingTelemetryObserver(
    {
      capture: <E extends TelemetryEventName>(name: E, properties: TelemetryEventMap[E]) =>
        void events.push({ name, properties }),
      breadcrumb: vi.fn(),
      startSpan: (_span, run) => {
        void run()
        finishes.push(() => {})
      },
    },
    () => now,
    () => 'operation-1',
  )
  return { observer, events, tick: (ms: number) => void (now += ms), finishes }
}

describe('player-loading telemetry observer', () => {
  it('emits every successful stage once across duplicate ready states', () => {
    const { observer, events, tick } = createHarness()
    observer.noteCommand('click')
    observer.observe({ step: 'importing' })
    tick(20)
    observer.observe({ step: 'matching', video })
    tick(30)
    observer.observe({ step: 'loading_danmaku', video, match })
    tick(50)
    const ready: LoadingState = {
      step: 'ready',
      video,
      match,
      danmaku: [],
      mergedComments: [{ cid: 1, m: 'hello', p: '1,1,1,1' }],
    }
    observer.observe(ready)
    observer.observe(ready)

    expect(events).toEqual([
      {
        name: 'video_import_started',
        properties: { operation_id: 'operation-1', source: 'click' },
      },
      {
        name: 'video_import_completed',
        properties: { operation_id: 'operation-1', duration_ms: 20, container: 'mkv' },
      },
      {
        name: 'danmaku_match_completed',
        properties: {
          operation_id: 'operation-1',
          result: 'automatic',
          duration_ms: 100,
          comment_count: 1,
        },
      },
    ])
  })

  it('classifies manual, skipped and cancelled matching without late duplicates', () => {
    const manual = createHarness()
    manual.observer.observe({ step: 'importing' })
    manual.observer.observe({ step: 'matching', video })
    manual.observer.observe({
      step: 'waiting_user',
      video,
      matchData: { isMatched: false, matches: [] },
    })
    manual.observer.observe({
      step: 'ready',
      video,
      match,
      danmaku: [],
      mergedComments: [],
    })
    expect(manual.events.at(-1)).toMatchObject({
      name: 'danmaku_match_completed',
      properties: { result: 'manual' },
    })

    const cancelled = createHarness()
    cancelled.observer.observe({ step: 'importing' })
    cancelled.observer.observe({ step: 'matching', video })
    cancelled.observer.observe({ step: 'idle' })
    cancelled.observer.observe({ step: 'ready', video, match, danmaku: [], mergedComments: [] })
    expect(cancelled.events.filter((event) => event.name === 'danmaku_match_completed')).toEqual([
      expect.objectContaining({ properties: expect.objectContaining({ result: 'cancelled' }) }),
    ])
  })

  it('emits one bounded failure event', () => {
    const { observer, events, tick } = createHarness()
    observer.observe({ step: 'importing' })
    tick(12)
    const failed: LoadingState = {
      step: 'error',
      error: { message: '/private/path failed with token', previousStep: 'matching' },
    }
    observer.observe(failed)
    observer.observe(failed)

    expect(events.at(-1)).toEqual({
      name: 'video_import_failed',
      properties: {
        operation_id: 'operation-1',
        error_code: 'player-loading-matching',
        duration_ms: 12,
      },
    })
  })
})
