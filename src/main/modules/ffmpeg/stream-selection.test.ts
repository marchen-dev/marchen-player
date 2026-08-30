import type { MediaProbeResult, MediaStream } from '@marchen/shared/media'
import { describe, expect, it } from 'vitest'
import { explicitPrimaryMapArguments, selectPrimaryMediaStreams } from './stream-selection'

const stream = (
  index: number,
  type: 'video' | 'audio',
  options: { default?: boolean; attached?: boolean; language?: string } = {},
): MediaStream =>
  ({
    index,
    type,
    codecName: type === 'video' ? 'h264' : 'aac',
    width: 320,
    height: 180,
    dynamicRange: 'sdr',
    disposition: {
      default: options.default ?? false,
      forced: false,
      attachedPicture: options.attached ?? false,
    },
    tags: { language: options.language },
  }) as MediaStream

const probe = (streams: MediaStream[]): MediaProbeResult => ({
  sourceId: 'source',
  formatNames: ['matroska'],
  startTime: 0,
  duration: 120,
  streams,
})

describe('fFmpeg 主轨选择', () => {
  it('排除 attached picture，default 优先于语言，最后按 index 稳定选择', () => {
    const result = selectPrimaryMediaStreams(
      probe([
        stream(0, 'video', { attached: true, default: true }),
        stream(3, 'video'),
        stream(1, 'audio', { default: true, language: 'eng' }),
        stream(2, 'audio', { language: 'jpn' }),
      ]),
      { preferredAudioLanguages: ['ja', 'en'] },
    )
    expect(result.primaryVideoStreamIndex).toBe(3)
    expect(result.primaryAudioStreamIndex).toBe(1)
    expect(explicitPrimaryMapArguments(result)).toEqual(['-map', '0:3', '-map', '0:1'])
  })

  it('无 default 时按规范化语言别名和 index 选择', () => {
    const result = selectPrimaryMediaStreams(
      probe([
        stream(0, 'video'),
        stream(4, 'audio', { language: 'zho' }),
        stream(2, 'audio', { language: 'eng' }),
      ]),
      { preferredAudioLanguages: ['zh', 'en'] },
    )
    expect(result.primaryAudioStreamIndex).toBe(4)
  })
})
