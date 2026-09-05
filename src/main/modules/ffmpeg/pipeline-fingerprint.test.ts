import type { PipelineRuntimeChoice, PlaybackDecision } from '@marchen/shared/media'
import { describe, expect, it } from 'vitest'
import { createPipelineFingerprint } from './pipeline-fingerprint'

const decision: PlaybackDecision = {
  method: 'transcode',
  trial: false,
  container: { action: 'remux', target: 'fmp4-hls' },
  video: {
    action: 'transcode',
    streamIndex: 0,
    sourceCodec: 'hevc',
    targetCodec: 'h264',
    pixelFormat: 'yuv420p',
    toneMap: 'none',
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
}
const runtime: PipelineRuntimeChoice = {
  videoDecoder: { name: 'hevc_videotoolbox', class: 'hardware' },
  videoEncoder: { name: 'h264_videotoolbox', class: 'hardware' },
  audioEncoder: { name: 'aac_at', class: 'system' },
}

describe('pipeline fingerprint', () => {
  it('相同媒体动作与 runtime choice 产生稳定 SHA-256', () => {
    const first = createPipelineFingerprint(decision, runtime)
    expect(createPipelineFingerprint(decision, runtime)).toEqual(first)
    expect(first).toMatchObject({ schemaVersion: 1, algorithm: 'sha256' })
    expect(first.value).toMatch(/^[a-f0-9]{64}$/)
  })

  it.each([
    ['video decoder', { videoDecoder: { name: 'hevc', class: 'software' as const } }],
    ['video encoder', { videoEncoder: { name: 'libx264', class: 'software' as const } }],
    ['audio encoder', { audioEncoder: { name: 'aac', class: 'software' as const } }],
  ])('%s 变化时 fingerprint 必须变化', (_label, override) => {
    expect(createPipelineFingerprint(decision, { ...runtime, ...override })).not.toEqual(
      createPipelineFingerprint(decision, runtime),
    )
  })

  it('诊断原因和 trial 不改变媒体 fingerprint', () => {
    expect(
      createPipelineFingerprint(
        {
          ...decision,
          trial: true,
          reasons: [
            { code: 'development-override', domain: 'runtime', source: 'development-override' },
          ],
        },
        runtime,
      ),
    ).toEqual(createPipelineFingerprint(decision, runtime))
  })
})
