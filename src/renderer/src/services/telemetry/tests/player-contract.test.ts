import type {
  MediaGenerationSnapshot,
  MediaProbeResult,
  PlaybackDecision,
  PlaybackJobSnapshot,
  PlaybackPlan,
  PlaybackSourceLeaseDescriptor,
} from '@marchen/shared/media'
import { MEDIA_COMPAT_ERROR_CODES } from '@marchen/shared/media'
import { describe, expect, it } from 'vitest'

import {
  mapGenerationToTelemetry,
  mapPlaybackDecisionToTelemetry,
  mapPlaybackJobToTelemetry,
  mapPlaybackLeaseToTelemetry,
  mapPlaybackPlanToTelemetry,
  TELEMETRY_MEDIA_ERROR_CODES,
  TELEMETRY_PLAYBACK_MODES,
  TELEMETRY_PLAYBACK_PLAN_REASONS,
} from '../player-contract'

const disposition = { default: true, forced: false, attachedPicture: false }
const probe: MediaProbeResult = {
  schemaVersion: 1,
  sourceFingerprint: {
    schemaVersion: 1,
    sourceId: 'private-source-id',
    pathKey: 'private-path-key',
    size: 1,
    mtimeMs: 1,
  },
  sourceId: 'private-source-id',
  formatNames: ['Matroska', 'webm'],
  startTime: 0,
  duration: 120,
  primaryVideoStreamIndex: 0,
  primaryAudioStreamIndex: 2,
  streams: [
    {
      type: 'video',
      index: 0,
      codecName: 'HEVC',
      width: 1920,
      height: 1080,
      dynamicRange: 'sdr',
      disposition,
      tags: {},
    },
    {
      type: 'audio',
      index: 2,
      codecName: 'EAC3',
      disposition,
      tags: {},
    },
  ],
}

describe('player telemetry contract', () => {
  it('freezes the complete public mode, reason and error-code vocabulary', () => {
    expect(TELEMETRY_PLAYBACK_MODES).toEqual([
      'direct',
      'remux',
      'transcode-audio',
      'transcode-video',
    ])
    expect(TELEMETRY_PLAYBACK_PLAN_REASONS).toEqual([
      'native-compatible',
      'container-incompatible',
      'audio-incompatible',
      'video-incompatible',
      'native-decode-failed',
    ])
    expect(TELEMETRY_MEDIA_ERROR_CODES).toEqual(MEDIA_COMPAT_ERROR_CODES)
  })

  it('maps plan and probe to bounded product fields without source identity', () => {
    const plan: PlaybackPlan = {
      kind: 'copy-video-aac',
      reason: 'audio-incompatible',
      videoStreamIndex: 0,
      audioStreamIndex: 2,
      video: 'copy',
      audio: { codec: 'aac', profile: 'aac_low', sampleRate: 48_000, channels: 2 },
      startupDeadlineMs: 8_000,
    }

    expect(mapPlaybackPlanToTelemetry(plan, probe)).toEqual({
      mode: 'transcode-audio',
      profile: 'copy-video-aac',
      reason: 'audio-incompatible',
      container: 'matroska',
      video_codec: 'hevc',
      audio_codec: 'eac3',
    })
  })

  it('keeps lease generation and timeline semantics while excluding URL/session IDs', () => {
    const lease: PlaybackSourceLeaseDescriptor = {
      id: 'lease-private',
      logicalSourceId: 'source-private',
      mode: 'remux',
      transport: 'hls',
      url: 'http://gateway/private-token/index.m3u8',
      sessionId: 'session-private',
      generation: 3,
      timeline: { originalDuration: 120, offset: 42, calibrated: true },
    }

    expect(mapPlaybackLeaseToTelemetry(lease)).toEqual({
      mode: 'remux',
      transport: 'hls',
      generation: 3,
      timeline_offset: 42,
      timeline_calibrated: true,
    })
  })

  it('maps generation summaries instead of per-segment events', () => {
    const generation: MediaGenerationSnapshot = {
      sessionId: 'private-session',
      generation: 4,
      status: 'finished',
      originalStartTime: 0,
      requestedStartTime: 60,
      actualFirstTimestamp: 60.04,
      producedDuration: 30,
      bytesWritten: 2048,
    }

    expect(mapGenerationToTelemetry(generation)).toEqual({
      generation: 4,
      status: 'finished',
      requested_start_time: 60,
      actual_first_timestamp: 60.04,
      produced_duration: 30,
      bytes_written: 2048,
    })
  })

  it('maps generalized decisions and jobs without pipeline identity or runtime names', () => {
    const decision: PlaybackDecision = {
      method: 'direct-stream',
      trial: false,
      container: { action: 'remux', target: 'fmp4-hls' },
      video: { action: 'copy', streamIndex: 0, sourceCodec: 'HEVC' },
      audio: {
        action: 'transcode',
        streamIndex: 2,
        sourceCodec: 'EAC3',
        targetCodec: 'aac',
        profile: 'aac-low-complexity',
        sampleRate: 48_000,
        channels: 2,
      },
      subtitle: { action: 'external-render' },
      reasons: [
        {
          code: 'audio-codec-not-supported',
          domain: 'audio',
          source: 'client-profile',
          streamIndex: 2,
        },
      ],
    }
    const job: PlaybackJobSnapshot = {
      id: 'private-job',
      sessionId: 'private-session',
      phase: 'producing',
      pipeline: { schemaVersion: 1, algorithm: 'sha256', value: 'private-fingerprint' },
      runtime: {
        videoEncoder: { name: 'copy', class: 'copy' },
        audioEncoder: { name: 'aac_at', class: 'system' },
      },
      coverage: { startSegment: 3 },
      requestedStartTime: 6,
      productionPosition: 30,
      consumptionPosition: 10,
      aheadDuration: 20,
      processingSpeed: 120,
      activeRequestCount: 1,
      waiterCount: 2,
    }

    expect(mapPlaybackDecisionToTelemetry(decision)).toEqual({
      method: 'direct-stream',
      container_action: 'remux',
      video_action: 'copy',
      audio_action: 'transcode',
      video_codec: 'hevc',
      audio_codec: 'eac3',
      reason_codes: ['audio-codec-not-supported'],
      trial: false,
    })
    expect(mapPlaybackJobToTelemetry(job)).toEqual({
      phase: 'producing',
      decoder_class: undefined,
      video_encoder_class: 'copy',
      audio_encoder_class: 'system',
      production_position: 30,
      consumption_position: 10,
      ahead_duration: 20,
      processing_speed: 120,
      active_request_count: 1,
      waiter_count: 2,
    })
  })
})
