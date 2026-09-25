import { describe, expect, it } from 'vitest'
import { normalizeSubtitleScale, scaleAssFontSize } from '../subtitles/font-scale'

describe('字幕字号缩放', () => {
  const ass =
    '[V4+ Styles]\r\nFormat: Name, Fontsize, Fontname\r\nStyle: Default,44,Noto Sans SC\r\n[Events]\r\nDialogue: 0,0,1,Default,,0,0,0,,{\\pos(100,200)\\fs40\\t(0,500,\\fs60)\\fscx95}正文\\fs40{\\fs+2}尾声'

  it('缩放样式与动画内绝对字号，保留坐标、字宽、正文和相对指令', () => {
    const scaled = scaleAssFontSize(ass, 150)
    expect(scaled).toContain('Style: Default,66,Noto Sans SC\r\n')
    expect(scaled).toContain('{\\pos(100,200)\\fs60\\t(0,500,\\fs90)\\fscx95}正文\\fs40{\\fs+2}')
    expect(scaleAssFontSize(ass, 100)).toBe(ass)
    expect(scaleAssFontSize(ass, 50)).toContain('Default,22,')
  })

  it('兼容 SSA 格式与非法设置', () => {
    expect(
      scaleAssFontSize('[V4 Styles]\nFormat: Fontsize, Name\nStyle: 20,Default', 200),
    ).toContain('Style:40,Default')
    expect(normalizeSubtitleScale(undefined)).toBe(100)
    expect(normalizeSubtitleScale(NaN)).toBe(100)
    expect(normalizeSubtitleScale(999)).toBe(200)
    expect(normalizeSubtitleScale(0)).toBe(50)
  })
})
