/**
 * 没有名称的音轨的默认名称。
 *
 * 这个名称不只是显示用：音轨偏好会把它连同语言、编码一起存进播放记录，下次打开时用来找回
 * 同一条音轨（见 audio-preference.ts）。所以它是一个稳定标识，固定为中文、不随界面语言变化；
 * 界面显示时再由 parseDefaultAudioTrackNumber 识别出来，换成当前语言的写法。
 *
 * 这里不引用界面多语言：兼容内核的解码 Worker 也要用它。
 */

/* eslint-disable marchen/no-hardcoded-ui-text -- 见上：这是存进播放记录的稳定标识，不是界面文字 */
const PREFIX = '音轨 '
/* eslint-enable marchen/no-hardcoded-ui-text */

export const defaultAudioTrackLabel = (number: number): string => `${PREFIX}${number}`

/** 如果是默认名称，返回其中的序号；否则返回 null（音轨自带名称，原样显示） */
export const parseDefaultAudioTrackNumber = (label: string): number | null => {
  if (!label.startsWith(PREFIX)) return null
  const rest = label.slice(PREFIX.length)
  return /^\d+$/.test(rest) ? Number(rest) : null
}
