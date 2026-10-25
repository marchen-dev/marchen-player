import { describe, expect, it } from 'vitest'
import {
  allocateExternalHistoryId,
  resolveTrackHistoryId,
  selectPreferredSubtitleTrack,
} from '../subtitles/preferences'

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

describe('字幕轨道的历史 id', () => {
  const tags = [
    { id: 3, origin: 'embedded' },
    { id: -2, origin: 'external', path: 'provider:4' },
    { id: -3, origin: 'external', path: '/local/a.ass' },
  ]

  it('内嵌轨道使用轨道号', () => {
    expect(
      resolveTrackHistoryId(
        {
          id: 'embedded:3',
          title: '',
          origin: 'embedded',
          embedded: { number: 3, uid: 'u', codec: 'c' },
        },
        tags,
        new Set(),
      ),
    ).toBe(3)
  })

  it('媒体源字幕按持久化标识沿用历史 id，续播能恢复选择', () => {
    const track = {
      id: 'provider:4',
      title: 'English',
      origin: 'external' as const,
      persistenceKey: 'provider:4',
    }
    expect(resolveTrackHistoryId(track, tags, new Set())).toBe(-2)
    // 已被占用时分配新 id，避免两条轨道共用一个历史项
    expect(resolveTrackHistoryId(track, tags, new Set([-2]))).toBe(-4)
  })

  it('没有标识的外挂轨道分配新 id', () => {
    expect(
      resolveTrackHistoryId({ id: 'nearby:/a', title: 'a', origin: 'external' }, tags, new Set()),
    ).toBe(-4)
  })
})
