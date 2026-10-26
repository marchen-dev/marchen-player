import type { SubtitleCue } from './matroska'
import { SubtitleError } from '@marchen/shared/media'

export interface TextSubtitleDocument {
  cues: SubtitleCue[]
  warnings: string[]
}

/** 输入预算与渲染预算分开，避免大文件在拆分字符串时无界分配。 */
const MAX_TEXT_LENGTH = 8 * 1024 * 1024
export function parseTextSubtitles(input: string, format: 'srt' | 'vtt'): TextSubtitleDocument {
  if (input.length > MAX_TEXT_LENGTH) throw new SubtitleError('too_large', '字幕超过 8 Mi 字符预算')
  const source = input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()
  if (format === 'vtt' && !/^WEBVTT(?:\s|$)/.test(source))
    throw new SubtitleError('vtt_header', 'WebVTT 文件头无效')
  const blocks = source.split(/\n[ \t]*\n/)
  const cues: SubtitleCue[] = []
  const warnings = new Set<string>()
  // 网上流传的字幕常有个别损坏块，跳过坏块而不是整份拒绝，只有一条都解析不出来时才失败。
  let skipped = 0
  for (let index = format === 'vtt' ? 1 : 0; index < blocks.length; index++) {
    const block = blocks[index]
    if (/^NOTE(?:\s|$)/.test(block) && format === 'vtt') continue
    if (/^(?:STYLE|REGION)(?:\s|$)/.test(block) && format === 'vtt') {
      warnings.add('WebVTT 区域与 CSS 样式暂不保留')
      continue
    }
    const lines = block.split('\n')
    const timingIndex = lines[0].includes('-->') ? 0 : 1
    const match = lines[timingIndex]?.trim().match(/^(\S+)\s+-->\s+(\S+)(?:[ \t]+(\S.*))?$/)
    const start = match ? timestamp(match[1], format) : undefined
    const end = match ? timestamp(match[2], format) : undefined
    if (start === undefined || end === undefined || end <= start) {
      skipped++
      continue
    }
    if (match?.[3]) warnings.add('字幕位置与排版参数暂按默认布局显示')
    const text = lines.slice(timingIndex + 1).join('\n')
    if (!text) continue
    if (/<(?:c[. >]|v[ >]|lang[ >]|ruby[ >]|rt[ >]|\d\d:)/i.test(text))
      warnings.add('WebVTT 扩展标记暂按普通文本显示')
    cues.push({ start, end, text })
  }
  if (!cues.length) {
    // 有坏块却没有任何可用字幕，多半是时间戳格式不认识，区分于真正的空文件。
    if (skipped) throw new SubtitleError('timestamp_invalid', '字幕时间格式无效')
    throw new SubtitleError('empty', '没有可显示的字幕事件')
  }
  if (skipped) warnings.add(`已跳过 ${skipped} 条时间格式无效的字幕`)
  return { cues, warnings: [...warnings] }
}

/**
 * 宽松接受常见的非标准时间戳：一位小时数、`,` 与 `.` 混用、不足三位的毫秒。
 * 毫秒按小数理解（`,5` 为 500ms），与多数播放器一致；SRT 仍要求小时位，VTT 小时可省略。
 */
const SRT_TIMESTAMP = /^(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/
const VTT_TIMESTAMP = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/

function timestamp(value: string, format: 'srt' | 'vtt'): number | undefined {
  const match = value.match(format === 'srt' ? SRT_TIMESTAMP : VTT_TIMESTAMP)
  if (!match || Number(match[2]) >= 60 || Number(match[3]) >= 60) return undefined
  const seconds =
    Number(match[1] ?? 0) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(`0.${match[4]}`)
  return Number.isFinite(seconds) ? seconds : undefined
}

const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,40,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

export function textSubtitlesToAss(cues: readonly SubtitleCue[]) {
  let size = 0
  const lines = cues.map((cue) => {
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start)
      throw new SubtitleError('timestamp_invalid', '字幕事件时间无效')
    size += cue.text.length
    if (size > MAX_TEXT_LENGTH) throw new SubtitleError('too_large', '字幕超过文本预算')
    return `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,${inlineText(cue.text)}`
  })
  return assHeader + lines.join('\n')
}

function assTime(seconds: number) {
  const cs = Math.max(0, Math.round(seconds * 100))
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`
}

function inlineText(text: string) {
  // 只允许基础文字装饰；用户文本里的 ASS 控制符不得直接变成排版指令。
  return text
    .split(/(<[^>]*>)/g)
    .map((part) => {
      const tag = part.match(/^<(\/)?([biu])>$/i)
      if (tag) return `{\\${tag[2].toLowerCase()}${tag[1] ? 0 : 1}}`
      if (/^<[^>]*>$/.test(part)) return ''
      return part
        .replace(
          /&(?:amp|lt|gt|quot|apos|nbsp);/g,
          (entity) =>
            ({
              '&amp;': '&',
              '&lt;': '<',
              '&gt;': '>',
              '&quot;': '"',
              '&apos;': "'",
              '&nbsp;': '\u00A0',
            })[entity]!,
        )
        .replace(/\\/g, '\\\uFEFF')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
        .replace(/\n/g, '\\N')
    })
    .join('')
}
