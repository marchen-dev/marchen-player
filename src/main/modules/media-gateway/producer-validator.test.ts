import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateHlsProducerOutput } from './producer-validator'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

const setup = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'marchen-producer-validator-'))
  temporaryDirectories.push(directory)
  const paths = {
    manifestPath: join(directory, 'index.m3u8'),
    initPath: join(directory, 'init.mp4'),
    firstSegmentPath: join(directory, 'segment-00000.m4s'),
  }
  await Promise.all(Object.values(paths).map((path) => writeFile(path, 'non-empty')))
  return paths
}

const safeProfile = {
  kind: 'safe-h264-aac-sdr' as const,
  reason: 'video-incompatible' as const,
  videoStreamIndex: 0,
  audioStreamIndex: 1,
  video: { codec: 'h264' as const, pixelFormat: 'yuv420p' as const, toneMapToSdr: false as const },
  audio: {
    codec: 'aac' as const,
    profile: 'aac_low' as const,
    sampleRate: 48_000 as const,
    channels: 2 as const,
  },
}

const probeResult = (overrides: Record<string, unknown> = {}) => ({
  streams: [
    { index: 0, codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' },
    { index: 1, codec_type: 'audio', codec_name: 'aac' },
  ],
  packets: [{ stream_index: 0, pts_time: '0.000000', dts_time: '-0.066667', flags: 'K_' }],
  ...overrides,
})

describe('hLS Producer Validator', () => {
  it('只有 H.264/yuv420p/AAC、有效时间戳和首关键帧全部成立才通过', async () => {
    const paths = await setup()
    const run = vi.fn().mockResolvedValue({
      stdout: Buffer.from(JSON.stringify(probeResult())),
    })
    await expect(
      validateHlsProducerOutput({
        ffprobe: '/runtime/ffprobe',
        executor: { run } as never,
        ...paths,
        profile: safeProfile,
      }),
    ).resolves.toBeUndefined()
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ executable: '/runtime/ffprobe', inputs: [paths.manifestPath] }),
    )
  })

  it.each([
    [
      'codec',
      probeResult({
        streams: [
          { index: 0, codec_type: 'video', codec_name: 'hevc', pix_fmt: 'yuv420p10le' },
          { index: 1, codec_type: 'audio', codec_name: 'aac' },
        ],
      }),
    ],
    ['关键帧', probeResult({ packets: [{ stream_index: 0, pts_time: '0', flags: '__' }] })],
    ['时间戳', probeResult({ packets: [{ stream_index: 0, flags: 'K_' }] })],
  ])('%s 不符合时返回 manifest-validation 阶段错误', async (_label, output) => {
    const paths = await setup()
    await expect(
      validateHlsProducerOutput({
        ffprobe: '/runtime/ffprobe',
        executor: {
          run: vi.fn().mockResolvedValue({ stdout: Buffer.from(JSON.stringify(output)) }),
        } as never,
        ...paths,
        profile: safeProfile,
      }),
    ).rejects.toMatchObject({
      detail: expect.objectContaining({ code: 'manifest-invalid', stage: 'manifest-validation' }),
    })
  })
})
