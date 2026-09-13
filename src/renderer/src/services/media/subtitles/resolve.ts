import type { SubtitleCue, SubtitleSource } from './matroska'
import { loadSubtitleFonts } from './fonts'
import { assDialogue, MatroskaSubtitles } from './matroska'
import { textSubtitlesToAss } from './text'

/** 形成 libass 轨道前执行文本总预算；解析失败只拒绝当前字幕请求。 */
export async function resolveEmbeddedSubtitle(
  source: SubtitleSource,
  number: number,
  signal?: AbortSignal,
  expected?: { uid: string; codec: string },
) {
  // 字体与字幕正文独立准备；任一失败后等待另一任务收尾，避免字体 URL 泄漏。
  const [textResult, fontResult] = await Promise.allSettled([
    readSubtitleContent(source, number, signal, expected),
    loadSubtitleFonts(source, signal),
  ])
  if (textResult.status === 'rejected') {
    if (fontResult.status === 'fulfilled') fontResult.value.close()
    throw textResult.reason
  }
  if (fontResult.status === 'rejected') throw fontResult.reason
  const content = textResult.value
  const fonts = fontResult.value
  let url: string
  try {
    signal?.throwIfAborted()
    url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  } catch (error) {
    fonts.close()
    throw error
  }
  let closed = false
  return {
    url,
    fonts: fonts.urls,
    warning: fonts.warning,
    release: () => {
      if (closed) return
      closed = true
      URL.revokeObjectURL(url)
      fonts.close()
    },
  }
}

async function readSubtitleContent(
  source: SubtitleSource,
  number: number,
  signal?: AbortSignal,
  expected?: { uid: string; codec: string },
) {
  const reader = await MatroskaSubtitles.open(source, signal)
  const track = reader.tracks.find((track) => track.number === number)
  if (!track) throw new Error('字幕轨不存在')
  if (expected && (track.uid !== expected.uid || track.codec !== expected.codec))
    throw new Error('字幕轨信息已变化，请重新选择')
  let size = track.header.length
  const cues: SubtitleCue[] = []
  for await (const cue of reader.cues(number, signal)) {
    size += cue.text.length
    if (size > 8 * 1024 * 1024 || cues.length >= 100000) throw new Error('字幕文本超过预算')
    cues.push(cue)
  }
  let content: string
  if (track.codec === 'S_TEXT/UTF8') content = textSubtitlesToAss(cues)
  else {
    const ssa = track.codec.endsWith('SSA')
    const header = track.header.replace(/\[Events\][\s\S]*$/i, '').trimEnd()
    const events = cues
      .map((cue) => assDialogue(cue, track.codec))
      .sort((a, b) => a.order - b.order)
    content = `${header}\n[Events]\nFormat: ${ssa ? 'Marked' : 'Layer'}, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.map((event) => event.line).join('\n')}`
  }
  return content
}
