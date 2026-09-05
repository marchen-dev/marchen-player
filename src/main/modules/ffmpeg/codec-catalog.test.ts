import { describe, expect, it } from 'vitest'
import {
  decoderCandidatesForCodec,
  normalizeMediaCodecName,
  resolveAvailableDecoder,
} from './codec-catalog'

describe('FFmpeg codec/decoder 目录', () => {
  it.each([
    ['H.265', 'hevc'],
    ['hvc1', 'hevc'],
    ['AVC', 'h264'],
    ['VC-1', 'vc1'],
    ['MPEG-2 Video', 'mpeg2video'],
    ['E-AC-3', 'eac3'],
    ['DTS', 'dca'],
  ])('规范化 %s 为 %s', (input, expected) => {
    expect(normalizeMediaCodecName(input)).toBe(expected)
  })

  it('AV1 按低成本候选顺序选择当前 runtime 实际存在的 decoder', () => {
    expect(decoderCandidatesForCodec('av1')).toEqual(['libdav1d', 'libaom-av1', 'av1'])
    expect(resolveAvailableDecoder('av1', new Set(['av1', 'libdav1d']))).toBe('libdav1d')
    expect(resolveAvailableDecoder('av1', new Set(['av1']))).toBe('av1')
  })

  it('覆盖通用视频与常见音频，并对未知 codec 返回空候选', () => {
    for (const codec of [
      'h264',
      'hevc',
      'av1',
      'vp8',
      'vp9',
      'vc1',
      'mpeg2video',
      'aac',
      'eac3',
      'flac',
      'opus',
    ]) {
      expect(decoderCandidatesForCodec(codec).length).toBeGreaterThan(0)
    }
    expect(decoderCandidatesForCodec('future-private-codec')).toEqual([])
    expect(
      resolveAvailableDecoder('future-private-codec', new Set(['future-private-codec'])),
    ).toBeUndefined()
  })
})
