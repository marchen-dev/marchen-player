import type {
  PipelineFingerprint,
  PipelineRuntimeChoice,
  PlaybackDecision,
} from '@marchen/shared/media'
import { createHash } from 'node:crypto'
import { PIPELINE_FINGERPRINT_SCHEMA_VERSION } from '@marchen/shared/media'

/** 只包含会改变输出媒体或 fragment 兼容性的字段，不包含原因、路径和 UI trial。 */
export const createPipelineFingerprint = (
  decision: PlaybackDecision,
  runtime: PipelineRuntimeChoice,
): PipelineFingerprint => {
  const input = {
    schemaVersion: PIPELINE_FINGERPRINT_SCHEMA_VERSION,
    method: decision.method,
    container: decision.container,
    video: decision.video,
    audio: decision.audio,
    runtime: {
      videoDecoder: runtime.videoDecoder,
      videoEncoder: runtime.videoEncoder,
      audioEncoder: runtime.audioEncoder,
    },
  }
  return {
    schemaVersion: PIPELINE_FINGERPRINT_SCHEMA_VERSION,
    algorithm: 'sha256',
    value: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
  }
}
