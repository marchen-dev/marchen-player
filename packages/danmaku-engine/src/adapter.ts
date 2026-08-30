import type { DanmakuItem, DanmakuMode } from './types'

export interface DandanplayComment {
  cid: number
  m: string
  p: string
}

export const convertDandanplayComments = (
  comments: ReadonlyArray<DandanplayComment>,
): DanmakuItem[] =>
  comments
    .map((comment, index) => {
      const [timeValue, modeValue, colorValue] = comment.p.split(',')
      const time = Number(timeValue)
      if (!Number.isFinite(time) || !comment.m) return null
      return {
        id: `${comment.cid}:${index}`,
        time: Math.max(0, time),
        text: comment.m,
        mode: parseMode(Number(modeValue)),
        color: parseColor(colorValue),
      } satisfies DanmakuItem
    })
    .filter((item): item is DanmakuItem => item !== null)
    .sort((left, right) => left.time - right.time)

const parseMode = (value: number): DanmakuMode => {
  if (value === 4) return 'bottom'
  if (value === 5) return 'top'
  return 'scroll'
}

const parseColor = (value: string) => {
  // 弹弹play接口返回十进制颜色，本地 B 站弹幕转换历史上使用 #RRGGBB；两种都要兼容。
  const parsed = value.startsWith('#') ? Number.parseInt(value.slice(1), 16) : Number(value)
  const safeValue = Number.isInteger(parsed) ? Math.min(0xFFFFFF, Math.max(0, parsed)) : 0xFFFFFF
  return `#${safeValue.toString(16).padStart(6, '0')}`
}
