import type { MediaSessionEvent } from '@marchen/shared/media'
import { describe, expect, it, vi } from 'vitest'

import { MediaGenerationTelemetryObserver } from './media-generation'

describe('media generation telemetry', () => {
  it('emits one bounded summary span for many progress and segment updates', () => {
    let now = 1_000
    const setAttributes = vi.fn()
    const end = vi.fn()
    const start = vi.fn(() => ({ setAttributes, end }))
    const observer = new MediaGenerationTelemetryObserver('transcode-video', { start }, () => now)
    const generation = (
      status: 'producing' | 'finished',
      producedDuration: number,
    ): MediaSessionEvent => ({
      type: 'generation-changed',
      generation: {
        sessionId: 'private-session',
        generation: 2,
        status,
        originalStartTime: 0,
        requestedStartTime: 60,
        actualFirstTimestamp: producedDuration > 1 ? 60.04 : undefined,
        producedDuration,
        bytesWritten: producedDuration * 1_000,
        segmentCount: Math.floor(producedDuration / 2),
        encoderClass: 'hardware',
      },
    })

    observer.observe(generation('producing', 0.5))
    now += 100
    observer.observe(generation('producing', 2.5))
    now += 900
    observer.observe(generation('finished', 20))

    expect(start).toHaveBeenCalledOnce()
    expect(setAttributes).toHaveBeenCalledOnce()
    expect(setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        generation: 2,
        encoder_class: 'hardware',
        segment_count: 10,
        produced_duration_s: 20,
        bytes_written: 20_000,
        startup_ms: 100,
        end_reason: 'finished',
      }),
    )
    expect(end).toHaveBeenCalledOnce()
  })
})
