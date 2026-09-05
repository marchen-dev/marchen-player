import type { RuntimeCommandRunner } from './runtime'
import { existsSync } from 'node:fs'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import {
  locateFfmpegRuntime,
  parseCodecCapabilities,
  parseFilterCapabilities,
  parseFormatCapabilities,
  parseHwaccelCapabilities,
  parseProtocolCapabilities,
  resolveFfmpegRuntime,
  supportsToneMapToSdr,
} from './runtime'

const temporaryDirectories: string[] = []

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  )
})

const createDevelopmentRuntime = async () => {
  const root = await import('node:fs/promises').then(({ mkdtemp }) =>
    mkdtemp(join(tmpdir(), 'marchen-runtime-test-')),
  )
  temporaryDirectories.push(root)
  const directory = join(root, 'resources', 'ffmpeg', 'darwin-arm64')
  await mkdir(directory, { recursive: true })
  for (const executable of ['ffmpeg', 'ffprobe']) {
    const path = join(directory, executable)
    await writeFile(path, '')
    await chmod(path, 0o755)
  }
  const commonCapabilities = {
    decoders: ['hevc'],
    encoders: ['libx264'],
    demuxers: ['matroska'],
    muxers: ['hls'],
    filters: ['tonemap'],
    protocols: ['file'],
  }
  await writeFile(
    join(directory, 'runtime-metadata.json'),
    JSON.stringify({
      schemaVersion: 1,
      ffmpegRelease: '9.0.1',
      target: 'darwin-arm64',
      versionOutputPrefix: 'ffmpeg version 9.0.1-test',
      commonCapabilities,
      platformEncoders: ['h264_videotoolbox'],
    }),
  )
  return { root, commonCapabilities }
}

const capableRunner: RuntimeCommandRunner = {
  async run(executable, arguments_) {
    if (arguments_.includes('-version')) {
      return {
        stdout: executable.endsWith('ffprobe')
          ? 'ffprobe version 9.0.1-test\n'
          : 'ffmpeg version 9.0.1-test\n',
        stderr: '',
      }
    }
    if (arguments_.includes('-decoders'))
      return { stdout: 'Decoders:\n V....D hevc HEVC\n V....D vp9 VP9\n', stderr: '' }
    if (arguments_.includes('-encoders'))
      return {
        stdout:
          'Encoders:\n V....D libx264 H.264\n V....D h264_videotoolbox H.264 VT\n A..... aac_at AAC\n',
        stderr: '',
      }
    if (arguments_.includes('-filters'))
      return { stdout: 'Filters:\n .. tonemap V->V\n TS zscale V->V\n', stderr: '' }
    if (arguments_.includes('-formats'))
      return {
        stdout: 'Formats:\n D   matroska Matroska\n  E  hls HLS\n DE  mp4 MP4\n',
        stderr: '',
      }
    if (arguments_.includes('-protocols'))
      return { stdout: 'Supported file protocols:\nInput:\n  file\nOutput:\n  file\n', stderr: '' }
    if (arguments_.includes('-hwaccels'))
      return { stdout: 'Hardware acceleration methods:\nvideotoolbox\n', stderr: '' }
    throw new Error(`未处理参数：${arguments_.join(' ')}`)
  },
}

describe('fFmpeg 运行时', () => {
  it('只有 zscale 与 tonemap 同时存在才声明 SDR tone-map 能力', () => {
    const base = {
      decoders: new Set<string>(),
      encoders: new Set<string>(),
      demuxers: new Set<string>(),
      muxers: new Set<string>(),
      hwaccels: new Set<string>(),
      formats: new Set<string>(),
      protocols: new Set<string>(),
    }
    expect(supportsToneMapToSdr({ ...base, filters: new Set(['zscale', 'tonemap']) })).toBe(true)
    expect(supportsToneMapToSdr({ ...base, filters: new Set(['tonemap']) })).toBe(false)
  })

  it('解析完整 codec、filter、format、protocol 与 hwaccel 目录', () => {
    expect(parseCodecCapabilities(' V....D hevc HEVC\n V..... libdav1d AV1\n')).toEqual(
      new Set(['hevc', 'libdav1d']),
    )
    expect(parseFilterCapabilities(' TS zscale V->V\n .. tonemap V->V\n')).toEqual(
      new Set(['zscale', 'tonemap']),
    )
    expect(parseFormatCapabilities(' D   matroska Matroska\n  E  hls HLS\n DE  mp4 MP4\n')).toEqual(
      {
        demuxers: new Set(['matroska', 'mp4']),
        muxers: new Set(['hls', 'mp4']),
      },
    )
    expect(parseProtocolCapabilities('Input:\n file\n http\nOutput:\n file\n')).toEqual(
      new Set(['file', 'http']),
    )
    expect(parseHwaccelCapabilities('Hardware acceleration methods:\nvideotoolbox\n')).toEqual(
      new Set(['videotoolbox']),
    )
  })

  it('开发态按平台架构定位，打包态定位到 resources/ffmpeg', () => {
    expect(
      locateFfmpegRuntime({
        isPackaged: false,
        resourcesPath: '/app/resources',
        developmentRoot: '/repo',
        platform: 'darwin',
        arch: 'arm64',
      }).directory,
    ).toBe('/repo/resources/ffmpeg/darwin-arm64')
    expect(
      locateFfmpegRuntime({
        isPackaged: true,
        resourcesPath: '/app/resources',
        developmentRoot: '/repo',
        platform: 'win32',
        arch: 'x64',
      }).ffmpeg,
    ).toBe('/app/resources/ffmpeg/ffmpeg.exe')
  })

  it('自检固定版本并汇总声明能力', async () => {
    const { root } = await createDevelopmentRuntime()
    const result = await resolveFfmpegRuntime({
      isPackaged: false,
      resourcesPath: '/unused',
      developmentRoot: root,
      platform: 'darwin',
      arch: 'arm64',
      runner: capableRunner,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.runtime.capabilities.decoders.has('hevc')).toBe(true)
      expect(result.runtime.capabilities.decoders.has('vp9')).toBe(true)
      expect(result.runtime.capabilities.encoders.has('h264_videotoolbox')).toBe(true)
      expect(result.runtime.capabilities.encoders.has('aac_at')).toBe(true)
      expect(result.runtime.capabilities.demuxers.has('matroska')).toBe(true)
      expect(result.runtime.capabilities.muxers.has('hls')).toBe(true)
      expect(result.runtime.capabilities.hwaccels.has('videotoolbox')).toBe(true)
    }
  })

  it('缺失声明能力时返回可降级错误', async () => {
    const { root } = await createDevelopmentRuntime()
    const result = await resolveFfmpegRuntime({
      isPackaged: false,
      resourcesPath: '/unused',
      developmentRoot: root,
      platform: 'darwin',
      arch: 'arm64',
      runner: {
        run: async (executable, arguments_) => {
          if (arguments_.includes('-version')) return capableRunner.run(executable, arguments_)
          return { stdout: '', stderr: '' }
        },
      },
    })

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'runtime-capability-missing', recoverable: true },
    })
  })

  it('二进制不存在时返回 runtime-unavailable', async () => {
    const result = await resolveFfmpegRuntime({
      isPackaged: false,
      resourcesPath: '/unused',
      developmentRoot: '/definitely/missing',
      platform: 'darwin',
      arch: 'arm64',
      runner: capableRunner,
    })

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'runtime-unavailable', recoverable: true },
    })
  })
})

const realRuntime = resolve('resources', 'ffmpeg', `${process.platform}-${process.arch}`, 'ffmpeg')
describe.runIf(existsSync(realRuntime))('真实 bundled FFmpeg runtime catalog', () => {
  it('公开通用 decoder、encoder、format、filter、protocol 与平台 hwaccel', async () => {
    const result = await resolveFfmpegRuntime({
      isPackaged: false,
      resourcesPath: '/unused',
      developmentRoot: resolve('.'),
      platform: process.platform,
      arch: process.arch,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const capabilities = result.runtime.capabilities
    expect(capabilities.decoders.has('h264')).toBe(true)
    expect(capabilities.decoders.has('hevc')).toBe(true)
    expect(
      [...capabilities.decoders].some((name) => ['libdav1d', 'libaom-av1', 'av1'].includes(name)),
    ).toBe(true)
    expect(capabilities.decoders.has('vp9')).toBe(true)
    expect(capabilities.decoders.has('vc1')).toBe(true)
    expect(capabilities.decoders.has('mpeg2video')).toBe(true)
    expect(capabilities.encoders.has('libx264')).toBe(true)
    expect(capabilities.encoders.has('aac')).toBe(true)
    expect(capabilities.demuxers.has('matroska')).toBe(true)
    expect(capabilities.muxers.has('hls')).toBe(true)
    expect(capabilities.filters.has('zscale')).toBe(true)
    expect(capabilities.protocols.has('file')).toBe(true)
    if (process.platform === 'darwin') {
      expect(capabilities.hwaccels.has('videotoolbox')).toBe(true)
    }
  })
})
