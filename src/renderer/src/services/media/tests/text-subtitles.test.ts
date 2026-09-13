import { expect, it } from 'vitest'
import { parseTextSubtitles, textSubtitlesToAss } from '../subtitles/text'

it('sRT 保留多行中文、逗号、基本装饰和非零时间', () => {
  const doc = parseTextSubtitles(
    '\uFEFF1\r\n00:00:05,125 --> 00:00:07,500\r\n<b>你好,世界</b>\r\n第二行 &amp; 文本\r\n',
    'srt',
  )
  expect(doc.cues[0]).toMatchObject({ start: 5.125, end: 7.5 })
  expect(textSubtitlesToAss(doc.cues)).toContain('{\\b1}你好,世界{\\b0}\\N第二行 & 文本')
})
it('vTT 支持短时间戳、标识与注释，报告不能保留的布局', () => {
  const doc = parseTextSubtitles(
    'WEBVTT\n\nNOTE 注释\n不显示\n\nSTYLE\n::cue { color: red }\n\n标识\n00:05.000 --> 00:07.000 align:start\n<i>文本</i>',
    'vtt',
  )
  expect(doc.cues).toHaveLength(1)
  expect(doc.cues[0].start).toBe(5)
  expect(doc.warnings).toHaveLength(2)
})
it('拒绝损坏时间，不悄悄产生空轨或倒退时长', () => {
  expect(() => parseTextSubtitles('1\n00:70:00,000 --> 00:71:00,000\n坏时间', 'srt')).toThrow()
  expect(() => parseTextSubtitles('WEBVTT\n\n00:05.000 --> 00:04.000\n倒退', 'vtt')).toThrow()
  expect(() => parseTextSubtitles('WEBVTT\n\n', 'vtt')).toThrow()
})
