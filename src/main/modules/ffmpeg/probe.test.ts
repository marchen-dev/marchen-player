import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { normalizeFfprobeOutput } from './probe'

interface FixtureManifest {
  fixtures: Array<{
    name: string
    tier: 'unit' | 'structure'
    traits: string[]
    probe: unknown
  }>
}

let manifest: FixtureManifest
beforeAll(async () => {
  manifest = JSON.parse(
    await readFile(resolve('test-results/media-compat/generated-manifest.json'), 'utf8'),
  ) as FixtureManifest
})

const fixture = (name: string) => manifest.fixtures.find((entry) => entry.name === name)!.probe

describe('ffprobe 规范化', () => {
  it('规范化容器、时间线、视频和音频基础字段', () => {
    const result = normalizeFfprobeOutput('native', fixture('native-h264-aac.mp4'))
    expect(result).toMatchObject({
      sourceId: 'native',
      formatNames: expect.arrayContaining(['mov', 'mp4']),
      startTime: 0,
      duration: 2,
    })
    expect(result.streams[0]).toMatchObject({
      type: 'video',
      codecName: 'h264',
      width: 320,
      height: 180,
      bitDepth: 8,
      frameRate: 30,
      disposition: { default: true, attachedPicture: false },
    })
    expect(result.streams[1]).toMatchObject({
      type: 'audio',
      codecName: 'aac',
      sampleRate: 48_000,
      channels: 1,
    })
  })

  it('保留 Main10 HDR 色彩字段和动态范围', () => {
    const result = normalizeFfprobeOutput('hdr', fixture('hevc-main10-hdr-aac.mkv'))
    expect(result.streams.find((stream) => stream.type === 'video')).toMatchObject({
      codecName: 'hevc',
      bitDepth: 10,
      colorSpace: 'bt2020nc',
      colorTransfer: 'smpte2084',
      colorPrimaries: 'bt2020',
      dynamicRange: 'hdr10',
      codecString: 'hvc1.2.4.L60.B0',
      codecStringSource: 'derived',
    })
  })

  it('未标记 Main10 SDR 不猜测 HDR，并补齐目标 HEVC codec string', () => {
    const result = normalizeFfprobeOutput(
      'main10-sdr',
      fixture('structure-main10-sdr-flac-long-gop.mkv'),
    )
    expect(result.streams.find((stream) => stream.type === 'video')).toMatchObject({
      codecName: 'hevc',
      bitDepth: 10,
      dynamicRange: 'unknown',
      codecString: 'hvc1.2.4.L60.B0',
      codecStringSource: 'derived',
    })
    expect(result.streams.find((stream) => stream.type === 'audio')).toMatchObject({
      codecName: 'flac',
      codecString: 'flac',
      codecStringSource: 'ffprobe',
    })
  })

  it('保留非零 start time、多音轨和 attached picture', () => {
    expect(normalizeFfprobeOutput('vfr', fixture('vfr-nonzero-start.mkv')).startTime).toBeCloseTo(5)
    const multi = normalizeFfprobeOutput('multi', fixture('multi-audio-attached-picture.mp4'))
    expect(multi.streams.filter((stream) => stream.type === 'audio')).toHaveLength(2)
    expect(
      multi.streams.some((stream) => stream.type === 'video' && stream.disposition.attachedPicture),
    ).toBe(true)
  })

  it('结构样本覆盖长 GOP、缺失 codec string、SDR/HDR 音频组合与 VFR', () => {
    const structures = manifest.fixtures.filter((entry) => entry.tier === 'structure')
    expect(structures).toHaveLength(5)
    expect(structures.flatMap((entry) => entry.traits)).toEqual(
      expect.arrayContaining([
        'long-gop',
        'missing-rfc6381',
        'sdr',
        'hdr10',
        'hlg',
        'flac',
        'eac3-5.1',
        'vfr',
        'nonzero-start',
        'multi-audio',
        'attached-picture',
        'rotation',
        'sar',
      ]),
    )
    for (const structure of structures) {
      const probe = structure.probe as { format?: { duration?: string } }
      expect(Number(probe.format?.duration)).toBeGreaterThanOrEqual(30)
    }
  })

  it('结构样本保留 HLG 与旋转/SAR/确定性主轨信息', () => {
    const hlg = normalizeFfprobeOutput('hlg', fixture('structure-hlg-long-gop.mkv'))
    expect(hlg.streams.find((stream) => stream.type === 'video')).toMatchObject({
      dynamicRange: 'hlg',
      colorTransfer: 'arib-std-b67',
      colorPrimaries: 'bt2020',
    })

    const rotated = normalizeFfprobeOutput('rotated', fixture('structure-rotated-multi-audio.mp4'))
    expect(rotated.streams.filter((stream) => stream.type === 'audio')).toHaveLength(2)
    expect(
      rotated.streams.find(
        (stream) => stream.type === 'video' && !stream.disposition.attachedPicture,
      ),
    ).toMatchObject({ sampleAspectRatio: '4:3', rotation: 90 })
    expect(
      rotated.streams.find(
        (stream) => stream.type === 'video' && !stream.disposition.attachedPicture,
      )?.index,
    ).toBe(0)
  })
})
