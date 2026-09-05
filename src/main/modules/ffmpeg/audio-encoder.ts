import type { AudioEncoderMode } from '@marchen/shared/media'

export type AacEncoder = 'aac_at' | 'aac'

export const aacEncoderArguments = (encoder: AacEncoder): string[] =>
  encoder === 'aac_at' ? ['-c:a', 'aac_at'] : ['-c:a', 'aac', '-profile:a', 'aac_low']

export const selectInitializedAacEncoder = async (
  platform: NodeJS.Platform,
  availableEncoders: ReadonlySet<string>,
  initialize: (encoder: AacEncoder) => Promise<void>,
  mode: AudioEncoderMode = 'auto',
): Promise<AacEncoder> => {
  const available: AacEncoder[] = [
    ...(platform === 'darwin' && availableEncoders.has('aac_at') ? (['aac_at'] as const) : []),
    ...(availableEncoders.has('aac') ? (['aac'] as const) : []),
  ]
  const candidates = available.filter((candidate) => {
    if (mode === 'system') return candidate === 'aac_at'
    if (mode === 'software') return candidate === 'aac'
    return true
  })
  const failures: unknown[] = []
  for (const candidate of candidates) {
    try {
      await initialize(candidate)
      return candidate
    } catch (error) {
      failures.push(error)
    }
  }
  throw new AggregateError(failures, '没有可初始化的 AAC encoder')
}

export const createAacEncoderInitializationArguments = (encoder: AacEncoder): string[] => [
  '-hide_banner',
  '-loglevel',
  'warning',
  '-nostdin',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:sample_rate=48000:duration=0.1',
  ...aacEncoderArguments(encoder),
  '-ar',
  '48000',
  '-ac',
  '2',
  '-b:a',
  '192k',
  '-f',
  'null',
  '-',
]

export const aacEncoderClass = (encoder: AacEncoder): 'system' | 'software' =>
  encoder === 'aac_at' ? 'system' : 'software'
