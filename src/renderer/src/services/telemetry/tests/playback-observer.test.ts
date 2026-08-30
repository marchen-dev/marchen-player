import type { PlaybackState } from '@marchen/playback-core'
import type { PlaybackSourceLeaseDescriptor } from '@marchen/shared/media'
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
const lease: PlaybackSourceLeaseDescriptor = {
  id: 'private-lease',
  logicalSourceId: 'private-source',
  mode: 'direct',
  transport: 'custom-protocol',
  url: 'marchen://private',
  timeline: { originalDuration: 120, offset: 0, calibrated: true },
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
    observer.completePrepare(attempt, lease)
    tick(150)
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
    const fallbackAttempt = observer.beginFallback('direct', 'transcode-video')

    expect(observer.completePrepare(directAttempt, lease)).toBe(false)
    expect(
      observer.completePrepare(
        fallbackAttempt,
        {
          ...lease,
          mode: 'transcode-video',
          transport: 'hls',
          generation: 0,
        },
        { fallback: true },
      ),
    ).toBe(true)
    expect(events).toEqual([
      expect.objectContaining({ name: 'compat_fallback_triggered' }),
      expect.objectContaining({
        name: 'media_prepare_completed',
        properties: expect.objectContaining({
          attempt_id: fallbackAttempt,
          mode: 'transcode-video',
          reason: 'native-decode-failed',
          generation: 0,
        }),
      }),
    ])
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
