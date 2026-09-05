export const COMPATIBILITY_REASON_CODES = [
  'container-not-supported',
  'container-remux-required',
  'video-codec-not-supported',
  'video-profile-not-supported',
  'video-level-not-supported',
  'video-bit-depth-not-supported',
  'video-range-not-supported',
  'video-framerate-not-supported',
  'video-resolution-not-supported',
  'video-codec-string-unknown',
  'audio-codec-not-supported',
  'audio-profile-not-supported',
  'audio-channels-not-supported',
  'audio-sample-rate-not-supported',
  'audio-bit-depth-not-supported',
  'subtitle-not-supported',
  'ffmpeg-decoder-unavailable',
  'ffmpeg-encoder-unavailable',
  'ffmpeg-filter-unavailable',
  'ffmpeg-format-unavailable',
  'keyframe-timeline-unavailable',
  'runtime-playback-failed',
  'development-override',
] as const

export type CompatibilityReasonCode = (typeof COMPATIBILITY_REASON_CODES)[number]
export type CompatibilityReasonDomain = 'container' | 'video' | 'audio' | 'subtitle' | 'runtime'
export type CompatibilityEvidenceSource =
  | 'input-facts'
  | 'client-profile'
  | 'ffmpeg-runtime'
  | 'target-probe'
  | 'runtime-error'
  | 'development-override'

/** 可序列化的兼容原因；details 只允许非敏感标量，不承载路径、token 或 stderr。 */
export interface CompatibilityReason {
  code: CompatibilityReasonCode
  domain: CompatibilityReasonDomain
  source: CompatibilityEvidenceSource
  streamIndex?: number
  inputValue?: string | number | boolean
  supportedValue?: string | number | boolean
}

export const isCompatibilityReasonCode = (value: string): value is CompatibilityReasonCode =>
  (COMPATIBILITY_REASON_CODES as readonly string[]).includes(value)

const REASON_PRIORITY: Record<CompatibilityReasonCode, number> = {
  'video-codec-not-supported': 0,
  'video-profile-not-supported': 1,
  'video-level-not-supported': 2,
  'video-bit-depth-not-supported': 3,
  'video-range-not-supported': 4,
  'video-framerate-not-supported': 5,
  'video-resolution-not-supported': 6,
  'video-codec-string-unknown': 7,
  'audio-codec-not-supported': 10,
  'audio-profile-not-supported': 11,
  'audio-channels-not-supported': 12,
  'audio-sample-rate-not-supported': 13,
  'audio-bit-depth-not-supported': 14,
  'subtitle-not-supported': 20,
  'container-not-supported': 30,
  'container-remux-required': 31,
  'ffmpeg-decoder-unavailable': 40,
  'ffmpeg-encoder-unavailable': 41,
  'ffmpeg-filter-unavailable': 42,
  'ffmpeg-format-unavailable': 43,
  'keyframe-timeline-unavailable': 44,
  'runtime-playback-failed': 45,
  'development-override': 50,
}

export const sortCompatibilityReasons = (
  reasons: readonly CompatibilityReason[],
): CompatibilityReason[] => {
  const unique = new Map<string, CompatibilityReason>()
  for (const reason of reasons) {
    const key = `${reason.code}:${reason.domain}:${reason.streamIndex ?? 'none'}`
    if (!unique.has(key)) unique.set(key, { ...reason })
  }
  return [...unique.values()].sort(
    (left, right) =>
      REASON_PRIORITY[left.code] - REASON_PRIORITY[right.code] ||
      (left.streamIndex ?? Number.MAX_SAFE_INTEGER) -
        (right.streamIndex ?? Number.MAX_SAFE_INTEGER),
  )
}
