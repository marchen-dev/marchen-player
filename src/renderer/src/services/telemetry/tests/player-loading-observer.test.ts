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

const createHarness = (playFirst = false) => {
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
    () => playFirst,
  )
  return { observer, events, tick: (ms: number) => void (now += ms), finishes }
}

describe('player-loading telemetry observer', () => {
  it('从播放记录续播媒体源时，入口记 history，media_kind 记 media_source', () => {
    const { observer, events } = createHarness()
    observer.noteCommand('history')
    observer.observe({ step: 'importing' })
    observer.observe({
      step: 'matching',
      video: {
        ...video,
        source: {
          kind: 'provider-item',
          hash: 'provider:s1:ep1',
          sourceId: 's1',
          provider: 'jellyfin',
          itemRef: 'ep1',
          name: 'ep1.mkv',
          size: 1,
        },
      },
    })
    expect(events.map((event) => event.properties)).toEqual([
      expect.objectContaining({ source: 'history' }),
      expect.objectContaining({ media_kind: 'media_source' }),
    ])
  })

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
        properties: {
          operation_id: 'operation-1',
          load_mode: 'complete',
          duration_ms: 20,
          media_kind: 'local',
          container: 'mkv',
        },
      },
      {
        name: 'playback_ready',
        properties: {
          operation_id: 'operation-1',
          load_mode: 'complete',
          duration_ms: 100,
          has_danmaku: true,
        },
      },
      {
        name: 'danmaku_match_completed',
        properties: {
          operation_id: 'operation-1',
          load_mode: 'complete',
          result: 'automatic',
          duration_ms: 100,
          comment_count: 1,
          matching_ms: 30,
          danmaku_load_ms: 50,
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

  it('records play-first readiness before the background match result', () => {
    const { observer, events, tick } = createHarness(true)
    observer.observe({ step: 'importing' })
    tick(10)
    observer.observe({ step: 'matching', video })
    tick(5)
    const unmatched = { episodeId: 0, animeId: 0, animeTitle: '', episodeTitle: '' }
    const pending: LoadingState = {
      step: 'ready',
      video,
      match: unmatched,
      background: { phase: 'matching' },
      danmaku: [],
      mergedComments: [],
    }
    observer.observe(pending)
    observer.observe({ ...pending, background: { phase: 'loading_danmaku' } })
    expect(events.map((event) => event.name)).toEqual([
      'video_import_started',
      'video_import_completed',
      'playback_ready',
    ])
    expect(events.at(-1)).toMatchObject({
      properties: { load_mode: 'play_first', duration_ms: 15, has_danmaku: false },
    })

    tick(200)
    const settled: LoadingState = {
      step: 'ready',
      video,
      match,
      matchOrigin: 'auto',
      danmakuStatus: 'loaded',
      danmaku: [],
      mergedComments: [{ cid: 1, m: 'hello', p: '1,1,1,1' }],
    }
    observer.observe(settled)
    observer.observe(settled)
    expect(events.filter((event) => event.name === 'danmaku_match_completed')).toEqual([
      {
        name: 'danmaku_match_completed',
        properties: {
          operation_id: 'operation-1',
          load_mode: 'play_first',
          result: 'automatic',
          duration_ms: 215,
          comment_count: 1,
          match_origin: 'auto',
          matching_ms: 5,
          danmaku_load_ms: 200,
        },
      },
    ])
  })

  it('classifies play-first unmatched, failed and superseded background results', () => {
    const base = {
      step: 'ready' as const,
      video,
      match: { episodeId: 0, animeId: 0, animeTitle: '', episodeTitle: '' },
      danmaku: [],
      mergedComments: [],
    }
    const run = (final: LoadingState) => {
      const harness = createHarness(true)
      harness.observer.observe({ step: 'importing' })
      harness.observer.observe({ step: 'matching', video })
      harness.observer.observe({ ...base, background: { phase: 'matching' } })
      harness.observer.observe(final)
      return harness.events.filter((event) => event.name === 'danmaku_match_completed')
    }
    expect(run({ ...base, danmakuStatus: 'unmatched' })).toEqual([
      expect.objectContaining({ properties: expect.objectContaining({ result: 'unmatched' }) }),
    ])
    expect(run({ ...base, matchError: { message: 'timeout' } })).toEqual([
      expect.objectContaining({ properties: expect.objectContaining({ result: 'failed' }) }),
    ])
    expect(run({ ...base, step: 'reloading', recovery: { target: match } })).toEqual([
      expect.objectContaining({ properties: expect.objectContaining({ result: 'cancelled' }) }),
    ])
  })

  it('记录 hashing 耗时、候选数与等待用户的时长', () => {
    const { observer, events, tick } = createHarness()
    observer.observe({ step: 'importing' })
    tick(10)
    observer.observe({ step: 'hashing', video: { name: 'anime.mkv' } })
    tick(400)
    observer.observe({ step: 'matching', video })
    tick(800)
    observer.observe({
      step: 'waiting_user',
      video,
      matchData: { isMatched: false, matches: [match, match, match] },
    })
    tick(5_000)
    observer.observe({ step: 'loading_danmaku', video, match })
    tick(300)
    observer.observe({
      step: 'ready',
      video,
      match,
      matchOrigin: 'manual',
      danmaku: [],
      mergedComments: [],
    })

    expect(events.find((event) => event.name === 'video_import_completed')).toMatchObject({
      properties: { duration_ms: 410, hash_ms: 400 },
    })
    expect(events.at(-1)).toEqual({
      name: 'danmaku_match_completed',
      properties: {
        operation_id: 'operation-1',
        load_mode: 'complete',
        result: 'manual',
        duration_ms: 6_510,
        comment_count: 0,
        candidate_count: 3,
        match_origin: 'manual',
        matching_ms: 800,
        user_wait_ms: 5_000,
        danmaku_load_ms: 300,
      },
    })
  })

  it('跳过弹幕时记录离开前的步骤', () => {
    const skipFrom = (before: LoadingState[]) => {
      const harness = createHarness()
      harness.observer.observe({ step: 'importing' })
      harness.observer.observe({ step: 'matching', video })
      for (const state of before) harness.observer.observe(state)
      harness.tick(100)
      harness.observer.observe({
        step: 'ready',
        video,
        match: { episodeId: 0, animeId: 0, animeTitle: '', episodeTitle: '' },
        danmakuStatus: 'skipped',
        danmaku: [],
        mergedComments: [],
      })
      return harness.events.at(-1)?.properties
    }

    expect(skipFrom([])).toMatchObject({ result: 'none', skip_from_step: 'matching' })
    expect(
      skipFrom([{ step: 'waiting_user', video, matchData: { isMatched: false, matches: [] } }]),
    ).toMatchObject({ result: 'none', skip_from_step: 'waiting_user', candidate_count: 0 })
    expect(
      skipFrom([{ step: 'match_failed', video, error: { message: 'timeout' } }]),
    ).toMatchObject({ result: 'none', skip_from_step: 'match_failed' })
    // 已选定剧集、弹幕加载中跳过：保留匹配结果，result 不是 none，但仍记录跳过来源
    const loading = createHarness()
    loading.observer.observe({ step: 'importing' })
    loading.observer.observe({ step: 'matching', video })
    loading.observer.observe({ step: 'loading_danmaku', video, match })
    loading.observer.observe({
      step: 'ready',
      video,
      match,
      danmakuStatus: 'skipped',
      danmaku: [],
      mergedComments: [],
    })
    expect(loading.events.at(-1)?.properties).toMatchObject({
      skip_from_step: 'loading_danmaku',
    })
  })

  it('没有跳过的未匹配结果不记录跳过来源', () => {
    const { observer, events } = createHarness()
    observer.observe({ step: 'importing' })
    observer.observe({ step: 'matching', video })
    observer.observe({
      step: 'ready',
      video,
      match: { episodeId: 0, animeId: 0, animeTitle: '', episodeTitle: '' },
      danmaku: [],
      mergedComments: [],
    })
    expect(events.at(-1)?.properties).toMatchObject({ result: 'none' })
    expect(events.at(-1)?.properties).not.toHaveProperty('skip_from_step', expect.anything())
  })

  it('取消时记录当时所处步骤和已停留时长', () => {
    const { observer, events, tick } = createHarness()
    observer.observe({ step: 'importing' })
    observer.observe({ step: 'matching', video })
    tick(1_200)
    observer.observe({ step: 'idle' })
    expect(events.at(-1)?.properties).toMatchObject({
      result: 'cancelled',
      skip_from_step: 'matching',
      matching_ms: 1_200,
    })

    // 新加载打断等待选择时，同样按旧加载离开前的步骤记录
    const replaced = createHarness()
    replaced.observer.observe({ step: 'importing' })
    replaced.observer.observe({ step: 'matching', video })
    replaced.observer.observe({
      step: 'waiting_user',
      video,
      matchData: { isMatched: false, matches: [match] },
    })
    replaced.tick(3_000)
    replaced.observer.observe({ step: 'importing' })
    expect(
      replaced.events.filter((event) => event.name === 'danmaku_match_completed').at(-1),
    ).toMatchObject({
      properties: {
        result: 'cancelled',
        skip_from_step: 'waiting_user',
        candidate_count: 1,
        user_wait_ms: 3_000,
      },
    })
  })

  it('优先播放后台阶段按后台 phase 计时，并读取后台候选数', () => {
    const { observer, events, tick } = createHarness(true)
    observer.observe({ step: 'importing' })
    observer.observe({ step: 'matching', video })
    tick(20)
    const base = {
      step: 'ready' as const,
      video,
      match: { episodeId: 0, animeId: 0, animeTitle: '', episodeTitle: '' },
      danmaku: [],
      mergedComments: [],
    }
    observer.observe({ ...base, background: { phase: 'matching' } })
    tick(600)
    observer.observe({
      ...base,
      danmakuStatus: 'unmatched',
      matchCandidates: { isMatched: false, matches: [match, match] },
    })
    expect(events.at(-1)?.properties).toMatchObject({
      result: 'unmatched',
      candidate_count: 2,
      matching_ms: 620,
    })

    const cancelled = createHarness(true)
    cancelled.observer.observe({ step: 'importing' })
    cancelled.observer.observe({ step: 'matching', video })
    cancelled.observer.observe({ ...base, background: { phase: 'loading_danmaku' } })
    cancelled.tick(900)
    cancelled.observer.observe({ step: 'idle' })
    expect(cancelled.events.at(-1)?.properties).toMatchObject({
      result: 'cancelled',
      skip_from_step: 'loading_danmaku',
      danmaku_load_ms: 900,
    })
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
