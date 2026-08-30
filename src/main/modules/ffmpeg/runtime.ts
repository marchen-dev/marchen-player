import type { MediaCompatError } from '@marchen/shared/media'
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, readFile } from 'node:fs/promises'

import { join } from 'node:path'

export interface FfmpegRuntimeMetadata {
  schemaVersion: number
  ffmpegRelease: string
  target: string
  versionOutputPrefix: string
  commonCapabilities: {
    decoders: string[]
    encoders: string[]
    demuxers: string[]
    muxers: string[]
    filters: string[]
    protocols: string[]
  }
  platformEncoders: string[]
}

export interface FfmpegRuntimePaths {
  directory: string
  ffmpeg: string
  ffprobe: string
  metadata: string
  target: string
}

export interface FfmpegRuntimeCapabilities {
  decoders: ReadonlySet<string>
  encoders: ReadonlySet<string>
  formats: ReadonlySet<string>
  filters: ReadonlySet<string>
  protocols: ReadonlySet<string>
}

export const supportsToneMapToSdr = (capabilities: FfmpegRuntimeCapabilities): boolean =>
  capabilities.filters.has('zscale') && capabilities.filters.has('tonemap')

export interface FfmpegRuntime {
  paths: FfmpegRuntimePaths
  metadata: FfmpegRuntimeMetadata
  capabilities: FfmpegRuntimeCapabilities
}

export type FfmpegRuntimeResult =
  { ok: true; runtime: FfmpegRuntime } | { ok: false; error: MediaCompatError }

export interface RuntimeCommandResult {
  stdout: string
  stderr: string
}

export interface RuntimeCommandRunner {
  run: (executable: string, arguments_: readonly string[]) => Promise<RuntimeCommandResult>
}

export interface ResolveFfmpegRuntimeOptions {
  isPackaged: boolean
  resourcesPath: string
  developmentRoot: string
  platform?: NodeJS.Platform
  arch?: string
  runner?: RuntimeCommandRunner
}

const RUNTIME_CHECK_TIMEOUT_MS = 10_000
const RUNTIME_CHECK_MAX_BUFFER = 2 * 1024 * 1024

const defaultRunner: RuntimeCommandRunner = {
  run: (executable, arguments_) =>
    new Promise((resolve, reject) => {
      execFile(
        executable,
        [...arguments_],
        {
          encoding: 'utf8',
          maxBuffer: RUNTIME_CHECK_MAX_BUFFER,
          timeout: RUNTIME_CHECK_TIMEOUT_MS,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error) reject(error)
          else resolve({ stdout, stderr })
        },
      )
    }),
}

export const locateFfmpegRuntime = (
  options: Omit<ResolveFfmpegRuntimeOptions, 'runner'>,
): FfmpegRuntimePaths => {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const target = `${platform}-${arch}`
  const directory = options.isPackaged
    ? join(options.resourcesPath, 'ffmpeg')
    : join(options.developmentRoot, 'resources', 'ffmpeg', target)
  const executableSuffix = platform === 'win32' ? '.exe' : ''

  return {
    directory,
    ffmpeg: join(directory, `ffmpeg${executableSuffix}`),
    ffprobe: join(directory, `ffprobe${executableSuffix}`),
    metadata: join(directory, 'runtime-metadata.json'),
    target,
  }
}

const unavailable = (message: string, cause?: unknown): FfmpegRuntimeResult => ({
  ok: false,
  error: {
    code: 'runtime-unavailable',
    message,
    recoverable: true,
    cause: cause instanceof Error ? cause.message : cause == null ? undefined : String(cause),
  },
})

const capabilityMissing = (names: readonly string[]): FfmpegRuntimeResult => ({
  ok: false,
  error: {
    code: 'runtime-capability-missing',
    message: `FFmpeg 运行时缺少必要能力：${names.join(', ')}`,
    recoverable: true,
  },
})

const assertStringArray = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new TypeError(`运行时元数据字段 ${field} 无效`)
  }
  return value
}

const parseMetadata = (source: string): FfmpegRuntimeMetadata => {
  const value = JSON.parse(source) as Partial<FfmpegRuntimeMetadata>
  if (
    typeof value.schemaVersion !== 'number' ||
    typeof value.ffmpegRelease !== 'string' ||
    typeof value.target !== 'string' ||
    typeof value.versionOutputPrefix !== 'string' ||
    typeof value.commonCapabilities !== 'object' ||
    value.commonCapabilities === null
  ) {
    throw new TypeError('FFmpeg 运行时元数据结构无效')
  }

  return {
    schemaVersion: value.schemaVersion,
    ffmpegRelease: value.ffmpegRelease,
    target: value.target,
    versionOutputPrefix: value.versionOutputPrefix,
    commonCapabilities: {
      decoders: assertStringArray(value.commonCapabilities.decoders, 'decoders'),
      encoders: assertStringArray(value.commonCapabilities.encoders, 'encoders'),
      demuxers: assertStringArray(value.commonCapabilities.demuxers, 'demuxers'),
      muxers: assertStringArray(value.commonCapabilities.muxers, 'muxers'),
      filters: assertStringArray(value.commonCapabilities.filters, 'filters'),
      protocols: assertStringArray(value.commonCapabilities.protocols, 'protocols'),
    },
    platformEncoders: assertStringArray(value.platformEncoders, 'platformEncoders'),
  }
}

const containsCapability = (output: string, name: string): boolean => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[\\s,])${escaped}(?:[\\s,]|$)`, 'm').test(output)
}

const collectCapabilities = (output: string, names: readonly string[]): ReadonlySet<string> =>
  new Set(names.filter((name) => containsCapability(output, name)))

const missingCapabilities = (
  metadata: FfmpegRuntimeMetadata,
  outputs: Record<'decoders' | 'encoders' | 'filters' | 'formats' | 'protocols', string>,
): string[] => {
  const expected = metadata.commonCapabilities
  return [
    ...expected.decoders.filter((name) => !containsCapability(outputs.decoders, name)),
    ...expected.encoders.filter((name) => !containsCapability(outputs.encoders, name)),
    ...expected.filters.filter((name) => !containsCapability(outputs.filters, name)),
    ...expected.demuxers.filter((name) => !containsCapability(outputs.formats, name)),
    ...expected.muxers.filter((name) => !containsCapability(outputs.formats, name)),
    ...expected.protocols.filter((name) => !containsCapability(outputs.protocols, name)),
  ]
}

export const resolveFfmpegRuntime = async (
  options: ResolveFfmpegRuntimeOptions,
): Promise<FfmpegRuntimeResult> => {
  const paths = locateFfmpegRuntime(options)
  const runner = options.runner ?? defaultRunner

  try {
    const accessMode =
      (options.platform ?? process.platform) === 'win32' ? constants.F_OK : constants.X_OK
    await Promise.all([access(paths.ffmpeg, accessMode), access(paths.ffprobe, accessMode)])

    const metadata = parseMetadata(await readFile(paths.metadata, 'utf8'))
    if (metadata.target !== paths.target) {
      return unavailable(`FFmpeg 运行时目标不匹配：期望 ${paths.target}，实际 ${metadata.target}`)
    }

    const [ffmpegVersion, ffprobeVersion, decoders, encoders, filters, formats, protocols] =
      await Promise.all([
        runner.run(paths.ffmpeg, ['-hide_banner', '-version']),
        runner.run(paths.ffprobe, ['-hide_banner', '-version']),
        runner.run(paths.ffmpeg, ['-hide_banner', '-decoders']),
        runner.run(paths.ffmpeg, ['-hide_banner', '-encoders']),
        runner.run(paths.ffmpeg, ['-hide_banner', '-filters']),
        runner.run(paths.ffmpeg, ['-hide_banner', '-formats']),
        runner.run(paths.ffmpeg, ['-hide_banner', '-protocols']),
      ])
    if (!ffmpegVersion.stdout.startsWith(metadata.versionOutputPrefix)) {
      return unavailable('FFmpeg 版本与固定运行时清单不一致')
    }
    if (!ffprobeVersion.stdout.startsWith('ffprobe version')) {
      return unavailable('ffprobe 自检没有返回有效版本信息')
    }

    const outputs = {
      decoders: decoders.stdout,
      encoders: encoders.stdout,
      filters: filters.stdout,
      formats: formats.stdout,
      protocols: protocols.stdout,
    }
    const missing = missingCapabilities(metadata, outputs)
    if (missing.length > 0) return capabilityMissing([...new Set(missing)])

    const declaredFormats = [
      ...metadata.commonCapabilities.demuxers,
      ...metadata.commonCapabilities.muxers,
    ]
    return {
      ok: true,
      runtime: {
        paths,
        metadata,
        capabilities: {
          decoders: collectCapabilities(outputs.decoders, metadata.commonCapabilities.decoders),
          encoders: collectCapabilities(outputs.encoders, [
            ...metadata.commonCapabilities.encoders,
            ...metadata.platformEncoders,
          ]),
          formats: collectCapabilities(outputs.formats, declaredFormats),
          filters: collectCapabilities(outputs.filters, metadata.commonCapabilities.filters),
          protocols: collectCapabilities(outputs.protocols, metadata.commonCapabilities.protocols),
        },
      },
    }
  } catch (error) {
    return unavailable('FFmpeg 运行时缺失、不可执行或自检失败', error)
  }
}
