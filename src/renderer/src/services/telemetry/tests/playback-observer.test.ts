import type { PlaybackState } from '@marchen/playback-core'
import type { TelemetryEventMap, TelemetryEventName } from '../contracts'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlaybackTelemetryObserver } from '../playback-observer'
import {
  beginPlaybackTelemetrySession,
  configurePlaybackSessionContext,
  endPlaybackTelemetrySession,
} from '../playback-session'

const source = { id: 'source', url: 'private', autoplay: true }
const playing = (time = 0): PlaybackState => ({
  status: 'playing',
  source,
  duration: 120,
  currentTime: time,
  rate: 1,
})
const presentation = {
  engine: 'canvas' as const,
  backend: 'hevc-wasm' as const,
  firstFrame: true,
  buffering: false,
  width: 1920,
  height: 1080,
}

const harness = () => {
  let now = 1_000
  let id = 0
  const events: Array<{ name: TelemetryEventName; properties: object }> = []
  const observer = new PlaybackTelemetryObserver(
    'operation',
    {
      capture: <E extends TelemetryEventName>(name: E, properties: TelemetryEventMap[E]) =>
        void events.push({ name, properties }),
      breadcrumb: vi.fn(),
      startSpan: (_span, run) => void run(),
    },
    () => now,
    () => `attempt-${++id}`,
    'playback-session',
  )
  return { observer, events, tick: (ms: number) => void (now += ms) }
}

afterEach(() => configurePlaybackSessionContext())

describe('playback telemetry observer', () => {
  it('tracks prepare, first frame and final quality once', () => {
    const { observer, events, tick } = harness()
    const attempt = observer.beginPrepare(1)
    tick(50)
    tick(150)
    observer.completeEnginePrepare(attempt, presentation, 'native-incompatible')
    observer.observe(playing())
    observer.observe(playing(1))
    tick(2_000)
    observer.onWaiting()
    tick(1_500)
    observer.onPlaying()
    observer.observe(playing(3.5))
    tick(1_000)
    observer.observe({ status: 'ended', source, duration: 120, rate: 1 })
    observer.observe({ status: 'ended', source, duration: 120, rate: 1 })

    expect(events.filter((event) => event.name === 'playback_started')).toEqual([
      expect.objectContaining({
        properties: expect.objectContaining({ attempt_id: attempt, time_to_first_frame_ms: 200 }),
      }),
    ])
    expect(events.filter((event) => event.name === 'playback_stalled')).toEqual([
      expect.objectContaining({
        properties: expect.objectContaining({ stall_duration_ms: 1_500, recovered: true }),
      }),
    ])
    expect(events.at(-1)).toEqual({
      name: 'playback_ended',
      properties: {
        operation_id: 'operation',
        reason: 'ended',
        watched_ms: 3_000,
        stall_count: 1,
        stall_duration_ms: 1_500,
      },
    })
  })

  it('creates a new fallback attempt and ignores a late prepare completion', () => {
    const { observer, events } = harness()
    const directAttempt = observer.beginPrepare(1)
    const fallbackAttempt = observer.beginPrepare(2)
    expect(observer.completeEnginePrepare(directAttempt, presentation, 'native-trial')).toBe(false)
    expect(
      observer.completeEnginePrepare(fallbackAttempt, presentation, 'native-decode-failed'),
    ).toBe(true)
    expect(events.find((event) => event.name === 'media_prepare_completed')).toMatchObject({
      properties: {
        attempt_id: fallbackAttempt,
        engine: 'canvas',
        backend: 'hevc-wasm',
        reason: 'native-decode-failed',
      },
    })
    expect(JSON.stringify(events)).not.toContain('private')
  })

  it('keeps playback session context generation-safe', () => {
    const setContext = vi.fn()
    configurePlaybackSessionContext(setContext)
    const first = beginPlaybackTelemetrySession()
    const second = beginPlaybackTelemetrySession()
    endPlaybackTelemetrySession(first)
    endPlaybackTelemetrySession(second)

    expect(setContext).toHaveBeenNthCalledWith(1, first)
    expect(setContext).toHaveBeenNthCalledWith(2, second)
    expect(setContext).toHaveBeenLastCalledWith(undefined)
  })
})

describe('seek 回执与首帧去重', () => {
  it('连续跳转分别记录旧目标取消和最新目标完成，不重复上报', () => {
    const { observer, events, tick } = harness()
    observer.beginPrepare(1, 'canvas')
    const seek = (targetTime: number): PlaybackState => ({
      status: 'seeking',
      source,
      duration: 120,
      targetTime,
      resumeAfterSeek: true,
      rate: 1,
    })
    observer.observe(seek(50))
    tick(20)
    observer.observe(seek(10))
    tick(70)
    observer.observe(playing(10))
    observer.observe(playing(10.1))
    const results = events.filter((event) => event.name === 'playback_seek_completed')
    expect(results.map((event) => event.properties)).toEqual([
      expect.objectContaining({ target_time: 50, duration_ms: 20, result: 'cancelled' }),
      expect.objectContaining({ target_time: 10, duration_ms: 70, result: 'success' }),
    ])
  })
  it('同一 attempt 的重复首帧与换内核取消都只记录一次', () => {
    const { observer, events } = harness()
    const attempt = observer.beginPrepare(1, 'native')
    expect(observer.completeEnginePrepare(attempt, presentation, 'trial')).toBe(true)
    expect(observer.completeEnginePrepare(attempt, presentation, 'trial')).toBe(false)
    observer.observe({
      status: 'seeking',
      source,
      duration: 120,
      targetTime: 20,
      resumeAfterSeek: false,
      rate: 1,
    })
    observer.beginPrepare(2, 'canvas')
    observer.finish('source_changed')
    expect(events.filter((event) => event.name === 'media_prepare_completed')).toHaveLength(1)
    expect(events.filter((event) => event.name === 'playback_seek_completed')).toHaveLength(1)
  })
})
