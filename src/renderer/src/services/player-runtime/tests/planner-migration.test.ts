import type { PlaybackDecision } from '@marchen/shared/media'
import { describe, expect, it } from 'vitest'
import type { CompatibilityNegotiationResult } from '../compatibility-negotiator'
import type { PlaybackPlanningResult } from '../playback-plan'
import {
  comparePlannerResults,
  resolvePlannerMigrationMode,
  selectPlannerForExecution,
} from '../planner-migration'

const legacyNative: PlaybackPlanningResult = {
  ok: true,
  plan: { kind: 'native', reason: 'native-compatible', videoStreamIndex: 0, audioStreamIndex: 1 },
}
const directDecision: PlaybackDecision = {
  method: 'direct-play',
  trial: false,
  container: { action: 'direct' },
  video: { action: 'direct', streamIndex: 0, sourceCodec: 'h264' },
  audio: { action: 'direct', streamIndex: 1, sourceCodec: 'aac' },
  subtitle: { action: 'external-render' },
  reasons: [],
}

describe('planner migration', () => {
  it('对语义相同的新旧决策不报告差异', () => {
    expect(comparePlannerResults(legacyNative, { ok: true, decision: directDecision })).toEqual({
      equal: true,
      legacy: {
        method: 'direct-play',
        containerAction: 'direct',
        videoAction: 'direct',
        audioAction: 'direct',
        reasons: [],
      },
      generalized: {
        method: 'direct-play',
        containerAction: 'direct',
        videoAction: 'direct',
        audioAction: 'direct',
        reasons: [],
      },
      differingFields: [],
    })
  })

  it('只输出有界 method/actions/reasons 差异', () => {
    const generalized: CompatibilityNegotiationResult = {
      ok: true,
      decision: {
        ...directDecision,
        method: 'transcode',
        container: { action: 'remux', target: 'fmp4-hls' },
        video: {
          action: 'transcode',
          streamIndex: 0,
          sourceCodec: 'h264',
          targetCodec: 'h264',
          pixelFormat: 'yuv420p',
          toneMap: 'none',
        },
        audio: {
          action: 'transcode',
          streamIndex: 1,
          sourceCodec: 'aac',
          targetCodec: 'aac',
          profile: 'aac-low-complexity',
          sampleRate: 48_000,
          channels: 2,
        },
        reasons: [
          {
            code: 'development-override',
            domain: 'runtime',
            source: 'development-override',
          },
        ],
      },
    }
    const comparison = comparePlannerResults(legacyNative, generalized)
    expect(comparison.equal).toBe(false)
    expect(comparison.differingFields).toEqual([
      'method',
      'containerAction',
      'videoAction',
      'audioAction',
      'reasons',
    ])
    expect(JSON.stringify(comparison)).not.toMatch(/path|token|url/i)
  })

  it('生产固定 legacy，开发态显式选择 shadow/generalized', () => {
    expect(
      resolvePlannerMigrationMode({ DEV: false, VITE_MEDIA_COMPAT_PLANNER: 'generalized' }),
    ).toBe('legacy')
    expect(resolvePlannerMigrationMode({ DEV: true, VITE_MEDIA_COMPAT_PLANNER: 'shadow' })).toBe(
      'shadow',
    )
    expect(
      resolvePlannerMigrationMode({ DEV: true, VITE_MEDIA_COMPAT_PLANNER: 'generalized' }),
    ).toBe('generalized')
  })

  it('generalized 失败时可明确回退 legacy', () => {
    expect(
      selectPlannerForExecution('generalized', legacyNative, {
        ok: false,
        error: { code: 'unknown', message: 'failed', recoverable: true },
      }),
    ).toEqual({ source: 'legacy', fallbackToLegacy: true })
  })
})
