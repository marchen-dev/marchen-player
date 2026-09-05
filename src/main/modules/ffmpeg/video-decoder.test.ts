import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FfmpegProcessExecutor } from './executor'
import {
  createHardwareVideoDecoderCandidates,
  createSoftwareVideoDecoderCandidate,
  selectInitializedVideoDecoder,
  verifyVideoDecoderCandidate,
  VideoDecoderSelectionError,
} from './video-decoder'

const software = {
  name: 'hevc',
  class: 'software' as const,
  inputArguments: ['-hwaccel', 'none', '-c:v', 'hevc'],
}
const hardware = {
  name: 'hevc_videotoolbox',
  class: 'hardware' as const,
  inputArguments: ['-hwaccel', 'videotoolbox'],
}

describe('视频 decoder 选择', () => {
  it('software 模式不尝试硬件候选', async () => {
    const attempts: string[] = []
    await expect(
      selectInitializedVideoDecoder({
        mode: 'software',
        software,
        hardware: [hardware],
        initialize: async (candidate) => void attempts.push(candidate.name),
      }),
    ).resolves.toEqual(software)
    expect(attempts).toEqual(['hevc'])
  })

  it('hardware 模式失败时不静默回退软件', async () => {
    const error = await selectInitializedVideoDecoder({
      mode: 'hardware',
      software,
      hardware: [hardware],
      initialize: async () => {
        throw new Error('hardware failed')
      },
    }).catch((cause) => cause)
    expect(error).toBeInstanceOf(VideoDecoderSelectionError)
    expect(error.attempted).toEqual(['hevc_videotoolbox'])
  })

  it('auto 硬件失败后回退软件', async () => {
    const attempts: string[] = []
    await expect(
      selectInitializedVideoDecoder({
        mode: 'auto',
        software,
        hardware: [hardware],
        initialize: async (candidate) => {
          attempts.push(candidate.name)
          if (candidate.class === 'hardware') throw new Error('hardware failed')
        },
      }),
    ).resolves.toEqual(software)
    expect(attempts).toEqual(['hevc_videotoolbox', 'hevc'])
  })

  it('软件候选来自 runtime 实际 decoder 目录', () => {
    expect(createSoftwareVideoDecoderCandidate('av1', new Set(['libdav1d', 'av1']))).toEqual({
      name: 'libdav1d',
      class: 'software',
      inputArguments: ['-hwaccel', 'none', '-c:v', 'libdav1d'],
    })
    expect(createSoftwareVideoDecoderCandidate('vc1', new Set())).toBeUndefined()
  })

  it('macOS 只将已验证 HEVC VideoToolbox 放入 auto 候选', () => {
    expect(
      createHardwareVideoDecoderCandidates('darwin', 'hevc', new Set(['videotoolbox'])),
    ).toEqual([hardware])
    expect(
      createHardwareVideoDecoderCandidates('darwin', 'av1', new Set(['videotoolbox'])),
    ).toEqual([])
  })

  it('Windows 只返回 runtime 声明且 codec 允许的候选顺序', () => {
    expect(
      createHardwareVideoDecoderCandidates('win32', 'hevc', new Set(['d3d11va', 'dxva2'])).map(
        (candidate) => candidate.name,
      ),
    ).toEqual(['hevc_d3d11va', 'hevc_dxva2'])
    expect(createHardwareVideoDecoderCandidates('win32', 'flac', new Set(['d3d11va']))).toEqual([])
  })
})

const ffmpeg = resolve('resources', 'ffmpeg', `${process.platform}-${process.arch}`, 'ffmpeg')
const fixture = resolve('test-results/media-compat/hevc-main10-aac.mkv')
describe.runIf(existsSync(ffmpeg) && existsSync(fixture))('真实软件 HEVC decoder', () => {
  it('明确禁用 hwaccel 后可解码真实 Main10 一帧', async () => {
    await expect(
      verifyVideoDecoderCandidate({
        ffmpeg,
        executor: new FfmpegProcessExecutor(),
        inputPath: fixture,
        videoStreamIndex: 0,
        candidate: software,
      }),
    ).resolves.toBeUndefined()
  })

  it.runIf(process.platform === 'darwin')('VideoToolbox 可解码真实 Main10 一帧', async () => {
    const candidate = createHardwareVideoDecoderCandidates(
      'darwin',
      'hevc',
      new Set(['videotoolbox']),
    )[0]!
    await expect(
      verifyVideoDecoderCandidate({
        ffmpeg,
        executor: new FfmpegProcessExecutor(),
        inputPath: fixture,
        videoStreamIndex: 0,
        candidate,
      }),
    ).resolves.toBeUndefined()
  })
})
