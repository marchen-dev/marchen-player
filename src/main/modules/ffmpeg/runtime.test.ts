import type { RuntimeCommandRunner } from './runtime'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { locateFfmpegRuntime, resolveFfmpegRuntime, supportsToneMapToSdr } from './runtime'

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
    return {
      stdout: ' hevc libx264 h264_videotoolbox matroska hls tonemap file ',
      stderr: '',
    }
  },
}

describe('fFmpeg 运行时', () => {
  it('只有 zscale 与 tonemap 同时存在才声明 SDR tone-map 能力', () => {
    const base = {
      decoders: new Set<string>(),
      encoders: new Set<string>(),
      formats: new Set<string>(),
      protocols: new Set<string>(),
    }
    expect(supportsToneMapToSdr({ ...base, filters: new Set(['zscale', 'tonemap']) })).toBe(true)
    expect(supportsToneMapToSdr({ ...base, filters: new Set(['tonemap']) })).toBe(false)
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
      expect(result.runtime.capabilities.encoders.has('h264_videotoolbox')).toBe(true)
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
