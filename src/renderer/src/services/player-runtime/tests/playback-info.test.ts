import type { PlaybackSourceLeaseDescriptor } from '@marchen/shared/media'
import { describe, expect, it } from 'vitest'
import { createPlaybackInfoRows } from '../playback-info'

it('播放信息展示决策、轨道动作、runtime、HDR 原因与 attempt chain', () => {
  const lease: PlaybackSourceLeaseDescriptor = {
    id: 'lease',
    logicalSourceId: 'source',
    mode: 'transcode-video',
    transport: 'hls',
    hlsSessionMode: 'stable-vod',
    url: 'http://127.0.0.1/media/token/index.m3u8',
    timeline: { originalDuration: 120, offset: 0, calibrated: true },
    attemptMethods: ['direct-play', 'transcode'],
    decision: {
      method: 'transcode',
      trial: false,
      container: { action: 'remux', target: 'fmp4-hls' },
      video: {
        action: 'transcode',
        streamIndex: 0,
        sourceCodec: 'hevc',
        targetCodec: 'h264',
        pixelFormat: 'yuv420p',
        toneMap: 'hdr-to-sdr',
      },
      audio: {
        action: 'transcode',
        streamIndex: 1,
        sourceCodec: 'eac3',
        targetCodec: 'aac',
        profile: 'aac-low-complexity',
        sampleRate: 48_000,
        channels: 2,
      },
      subtitle: { action: 'external-render' },
      reasons: [{ code: 'video-codec-not-supported', domain: 'video', source: 'client-profile' }],
    },
    job: {
      id: 'job',
      sessionId: 'session',
      phase: 'producing',
      pipeline: { schemaVersion: 1, algorithm: 'sha256', value: 'pipeline' },
      runtime: {
        videoDecoder: { name: 'hevc', class: 'software' },
        videoEncoder: { name: 'h264_videotoolbox', class: 'hardware' },
        audioEncoder: { name: 'aac_at', class: 'system' },
      },
      coverage: { startSegment: 0 },
      requestedStartTime: 0,
      activeRequestCount: 0,
      waiterCount: 0,
    },
  }
  expect(createPlaybackInfoRows(lease)).toEqual(
    expect.arrayContaining([
      { label: '方式', value: 'Full Transcode' },
      { label: '视频', value: 'hevc → h264 / 转码' },
      { label: '音频', value: 'eac3 → aac / 转码' },
      { label: 'HDR', value: 'HDR → SDR' },
      { label: 'Video decoder', value: 'hevc (software)' },
      { label: 'Video encoder', value: 'h264_videotoolbox (hardware)' },
      { label: 'Audio encoder', value: 'aac_at (system)' },
      { label: 'Attempt chain', value: 'Direct Play → Full Transcode' },
    ]),
  )
})
