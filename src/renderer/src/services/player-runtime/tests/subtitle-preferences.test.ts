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

  it('界面语言为简体中文时与不传界面语言的结果一致', () => {
    expect(selectPreferredSubtitleTrack(tracks, undefined, 'zh-CN')?.id).toBe('embedded:1')
    expect(selectPreferredSubtitleTrack([tracks[0]!], undefined, 'zh-CN')?.id).toBe('embedded:0')
  })

  it('界面语言为英文时优先英文轨', () => {
    expect(selectPreferredSubtitleTrack(tracks, undefined, 'en')?.id).toBe('embedded:0')
    // 轨道顺序不影响结果
    expect(selectPreferredSubtitleTrack([...tracks].reverse(), undefined, 'en')?.id).toBe(
      'embedded:0',
    )
  })

  it('界面语言为英文但没有英文轨时回落到中文轨，再到首轨', () => {
    const japanese = {
      ...tracks[0]!,
      id: 'embedded:2',
      historyId: 2,
      title: '日本語',
      language: 'jpn',
    }
    expect(selectPreferredSubtitleTrack([japanese, tracks[1]!], undefined, 'en')?.id).toBe(
      'embedded:1',
    )
    expect(selectPreferredSubtitleTrack([japanese], undefined, 'en')?.id).toBe('embedded:2')
  })

  it('历史选择优先于界面语言', () => {
    expect(selectPreferredSubtitleTrack(tracks, 1, 'en')?.id).toBe('embedded:1')
  })

  it('按语言代码而不是标题判断，带地区的代码也能匹配', () => {
    const withRegion = [
      { ...tracks[1]!, language: 'zh-Hans' },
      { ...tracks[0]!, language: 'en-US' },
    ]
    expect(selectPreferredSubtitleTrack(withRegion, undefined, 'en')?.id).toBe('embedded:0')
    // 恰好以 en 开头的其他语言代码（如中古英语 enm）不当成英文
    const notEnglish = [
      { ...tracks[1]!, language: 'zho' },
      { ...tracks[0]!, language: 'enm' },
    ]
    expect(selectPreferredSubtitleTrack(notEnglish, undefined, 'en')?.id).toBe('embedded:1')
  })

  it('伪本地化按英文处理', () => {
    expect(selectPreferredSubtitleTrack(tracks, undefined, 'pseudo')?.id).toBe('embedded:0')
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

describe('图片字幕（PGS）的选择记忆', () => {
  const pgs = (number: number, title: string, language: string) => ({
    id: `embedded:${number}`,
    title,
    language,
    origin: 'embedded' as const,
    kind: 'bitmap' as const,
    embedded: { number, uid: String(9000 + number), codec: 'S_HDMV/PGS' },
  })

  it('与文本内嵌轨一样以轨道号作为历史 id', () => {
    expect(resolveTrackHistoryId(pgs(8, 'cht Mandarin', 'zh-Hant'), [], new Set())).toBe(8)
  })

  it('历史默认轨为 PGS 时恢复它；没有历史时优先中文 PGS 轨', () => {
    const options = [pgs(6, 'chs&jpn', 'zh-Hans'), pgs(8, 'cht Mandarin', 'zh-Hant'), pgs(11, 'eng', 'en')].map(
      (track) => ({ ...track, historyId: track.embedded.number }),
    )
    expect(selectPreferredSubtitleTrack(options, 8)?.id).toBe('embedded:8')
    expect(selectPreferredSubtitleTrack(options)?.id).toBe('embedded:6')
  })
})
