import type { InitFingerprint, InitTrackFingerprint } from '@marchen/shared/media'
import type { FfmpegExecutionOptions, FfmpegExecutionResult } from './executor'
import { createHash } from 'node:crypto'
import { INIT_FINGERPRINT_SCHEMA_VERSION } from '@marchen/shared/media'

interface InitProbeExecutor {
  run: (options: FfmpegExecutionOptions) => Promise<FfmpegExecutionResult>
}

interface ProbeStream {
  index?: number
  id?: string
  codec_name?: string
  codec_tag_string?: string
  profile?: string
  level?: number
  time_base?: string
  extradata?: string
  extradata_size?: number
}

const normalizedExtradata = (value: string | undefined): string =>
  `${value ?? ''}`
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[0-9a-f]+:\s*/i, '').replace(/\s+/g, ''))
    .join('')

const track = (stream: ProbeStream, order: number): InitTrackFingerprint => ({
  order,
  trackId: stream.id ?? String(stream.index ?? order),
  codec: stream.codec_name ?? 'unknown',
  sampleEntry: stream.codec_tag_string ?? 'unknown',
  profile: stream.profile,
  level: stream.level,
  timeBase: stream.time_base ?? 'unknown',
  extradataSize: stream.extradata_size ?? 0,
  extradataHash: createHash('sha256').update(normalizedExtradata(stream.extradata)).digest('hex'),
})

export const createInitFingerprintFromProbe = (value: unknown): InitFingerprint => {
  const streams = (value as { streams?: ProbeStream[] })?.streams ?? []
  if (streams.length === 0) throw new Error('init fingerprint 缺少轨道')
  return {
    schemaVersion: INIT_FINGERPRINT_SCHEMA_VERSION,
    tracks: streams.map(track),
  }
}

export const inspectInitFingerprint = async (options: {
  ffprobe: string
  executor: InitProbeExecutor
  initPath: string
  signal?: AbortSignal
}): Promise<InitFingerprint> => {
  const result = await options.executor.run({
    executable: options.ffprobe,
    arguments: [
      '-v',
      'error',
      '-show_streams',
      '-show_data',
      '-show_entries',
      'stream=index,id,codec_name,codec_tag_string,profile,level,time_base,extradata,extradata_size',
      '-of',
      'json',
      options.initPath,
    ],
    inputs: [options.initPath],
    allowedInputProtocols: ['file'],
    signal: options.signal,
    timeoutMs: 5_000,
    stdoutLimitBytes: 1024 * 1024,
    stderrLimitBytes: 16 * 1024,
    kind: 'probe',
  })
  return createInitFingerprintFromProbe(JSON.parse(result.stdout.toString('utf8')))
}

export class InitFingerprintMismatchError extends Error {
  constructor(
    readonly expected: InitFingerprint,
    readonly actual: InitFingerprint,
  ) {
    super('FFmpeg Job init fingerprint 与当前 HLS session 不兼容')
    this.name = 'InitFingerprintMismatchError'
  }
}

const cloneFingerprint = (value: InitFingerprint): InitFingerprint => ({
  schemaVersion: value.schemaVersion,
  tracks: value.tracks.map((item) => ({ ...item })),
})

export class InitFingerprintGuard {
  #expected?: InitFingerprint

  get expected(): InitFingerprint | undefined {
    return this.#expected ? cloneFingerprint(this.#expected) : undefined
  }

  accept(candidate: InitFingerprint): void {
    if (!this.#expected) {
      this.#expected = cloneFingerprint(candidate)
      return
    }
    if (JSON.stringify(this.#expected) !== JSON.stringify(candidate)) {
      throw new InitFingerprintMismatchError(
        cloneFingerprint(this.#expected),
        cloneFingerprint(candidate),
      )
    }
  }
}
