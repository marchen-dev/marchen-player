import { describe, expect, it } from 'vitest'
import { allocateExternalHistoryId, selectPreferredSubtitleTrack } from '../subtitles/preferences'

const tracks = [
  {
    id: 'embedded:0',
    historyId: 0,
    title: 'English',
    language: 'eng',
    origin: 'embedded' as const,
  },
  {
    id: 'embedded:1',
    historyId: 1,
    title: '简体中文',
    language: 'zho',
    origin: 'embedded' as const,
  },
]

describe('subtitle preferences', () => {
  it('历史默认轨优先于中文轨', () => {
    expect(selectPreferredSubtitleTrack(tracks, 0)?.id).toBe('embedded:0')
  })

  it('没有历史默认时优先中文，再降级到首轨', () => {
    expect(selectPreferredSubtitleTrack(tracks)?.id).toBe('embedded:1')
    expect(selectPreferredSubtitleTrack([tracks[0]!])?.id).toBe('embedded:0')
  })

  it('外挂字幕 id 保持为小于现有值的负数', () => {
    expect(allocateExternalHistoryId([{ id: -2 }, { id: 1 }], new Set([-3]))).toBe(-4)
  })
})
