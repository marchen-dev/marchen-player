import type { PlaybackPlanningResult } from './playback-plan'
import type { CompatibilityNegotiationResult } from './compatibility-negotiator'

export type PlannerMigrationMode = 'legacy' | 'shadow' | 'generalized'

export interface PlannerMigrationEnvironment {
  DEV: boolean
  VITE_MEDIA_COMPAT_PLANNER?: string
}

export interface PlannerSummary {
  method: 'direct-play' | 'direct-stream' | 'transcode' | 'failed'
  containerAction?: 'direct' | 'remux'
  videoAction?: 'direct' | 'copy' | 'transcode'
  audioAction?: 'direct' | 'copy' | 'transcode'
  reasons: string[]
  errorCode?: string
}

export interface PlannerShadowComparison {
  equal: boolean
  legacy: PlannerSummary
  generalized: PlannerSummary
  differingFields: Array<keyof PlannerSummary>
}

const legacyReasons = (result: PlaybackPlanningResult): string[] => {
  if (!result.ok) return []
  switch (result.plan.reason) {
    case 'native-compatible':
      return []
    case 'container-incompatible':
      return ['container-remux-required']
    case 'audio-incompatible':
      return ['audio-codec-not-supported']
    case 'video-incompatible':
      return ['video-codec-not-supported']
    case 'native-decode-failed':
      return ['runtime-playback-failed']
  }
}

export const summarizeLegacyPlanning = (result: PlaybackPlanningResult): PlannerSummary => {
  if (!result.ok) return { method: 'failed', reasons: [], errorCode: result.error.code }
  switch (result.plan.kind) {
    case 'native':
      return {
        method: 'direct-play',
        containerAction: 'direct',
        videoAction: 'direct',
        audioAction: result.plan.audioStreamIndex === undefined ? undefined : 'direct',
        reasons: legacyReasons(result),
      }
    case 'copy-video-aac':
      return {
        method: 'direct-stream',
        containerAction: 'remux',
        videoAction: 'copy',
        audioAction: result.plan.audioStreamIndex === undefined ? undefined : 'transcode',
        reasons: legacyReasons(result),
      }
    case 'safe-h264-aac-sdr':
    case 'hdr-to-sdr-h264-aac':
      return {
        method: 'transcode',
        containerAction: 'remux',
        videoAction: 'transcode',
        audioAction: result.plan.audioStreamIndex === undefined ? undefined : 'transcode',
        reasons: legacyReasons(result),
      }
  }
}

export const summarizeGeneralizedPlanning = (
  result: CompatibilityNegotiationResult,
): PlannerSummary =>
  result.ok
    ? {
        method: result.decision.method,
        containerAction: result.decision.container.action,
        videoAction: result.decision.video.action,
        audioAction: result.decision.audio?.action,
        reasons: result.decision.reasons.map((reason) => reason.code),
      }
    : { method: 'failed', reasons: [], errorCode: result.error.code }

export const comparePlannerResults = (
  legacyResult: PlaybackPlanningResult,
  generalizedResult: CompatibilityNegotiationResult,
): PlannerShadowComparison => {
  const legacy = summarizeLegacyPlanning(legacyResult)
  const generalized = summarizeGeneralizedPlanning(generalizedResult)
  const fields: Array<keyof PlannerSummary> = [
    'method',
    'containerAction',
    'videoAction',
    'audioAction',
    'reasons',
    'errorCode',
  ]
  const differingFields = fields.filter(
    (field) => JSON.stringify(legacy[field]) !== JSON.stringify(generalized[field]),
  )
  return { equal: differingFields.length === 0, legacy, generalized, differingFields }
}

export const resolvePlannerMigrationMode = (
  environment: PlannerMigrationEnvironment,
): PlannerMigrationMode => {
  if (!environment.DEV) return 'legacy'
  const value = environment.VITE_MEDIA_COMPAT_PLANNER
  return value === 'shadow' || value === 'generalized' ? value : 'legacy'
}

export const selectPlannerForExecution = (
  mode: PlannerMigrationMode,
  legacy: PlaybackPlanningResult,
  generalized: CompatibilityNegotiationResult,
): { source: 'legacy' | 'generalized'; fallbackToLegacy: boolean } =>
  mode === 'generalized' && generalized.ok
    ? { source: 'generalized', fallbackToLegacy: false }
    : { source: 'legacy', fallbackToLegacy: mode === 'generalized' && !generalized.ok && legacy.ok }
