/**
 * 弹幕外观偏好（字号、速度、显示区域、同屏上限）的取值表与归一化。
 *
 * 这里只放数值，不放界面文字：档位名称在渲染时按 id 取文案。
 */

/** 同一时刻画面上的弹幕上限，只作为性能保护，不再提供设置 */
export const DANMAKU_MAX_ON_SCREEN = 120

/** 字号 100% 对应的像素 */
export const DANMAKU_FONT_BASE_PX = 26
export const DANMAKU_FONT_SCALE = { min: 80, max: 200, step: 5, default: 100 } as const

/**
 * 旧版按像素保存字号，下拉选项的标签与实际倍数并不一致（「80%」是 22px）。
 * 迁移按用户当时看到的标签取值，保证升级后显示的百分比不变；像素最多差 1px。
 */
const LEGACY_FONT_PX_TO_SCALE: Readonly<Record<string, number>> = {
  22: 80,
  24: 90,
  26: 100,
  28: 110,
  30: 120,
  32: 130,
  34: 140,
  39: 150,
  42: 160,
  44: 170,
  47: 180,
  49: 190,
  52: 200,
}

const clampToStep = (value: number, min: number, max: number, step: number) =>
  Math.min(max, Math.max(min, Math.round(value / step) * step))

/** 优先使用新字段；没有时从旧的像素字段迁移；都不可用时取默认值 */
export const normalizeDanmakuFontScale = (scale: unknown, legacyPx?: unknown): number => {
  const { min, max, step } = DANMAKU_FONT_SCALE
  if (typeof scale === 'number' && Number.isFinite(scale)) {
    return clampToStep(scale, min, max, step)
  }
  if (typeof legacyPx === 'string' || typeof legacyPx === 'number') {
    const mapped = LEGACY_FONT_PX_TO_SCALE[String(legacyPx).trim()]
    if (mapped !== undefined) return mapped
    const px = Number(legacyPx)
    if (Number.isFinite(px) && px > 0) {
      return clampToStep((px / DANMAKU_FONT_BASE_PX) * 100, min, max, step)
    }
  }
  return DANMAKU_FONT_SCALE.default
}

export const danmakuFontScaleToPx = (scale: number) =>
  Math.round((DANMAKU_FONT_BASE_PX * scale) / 100)

/**
 * 弹幕速度从慢到快排列，存的是一条弹幕滚过屏幕的毫秒数。
 * 旧版「极慢」17s、「较慢」19s 顺序是反的，这里按真实快慢重新排；已保存的毫秒值不变。
 */
export const danmakuSpeedLevels = [
  { id: 'verySlow', value: '19000' },
  { id: 'slow', value: '17000' },
  { id: 'normal', value: '15000' },
  { id: 'fast', value: '13000' },
  { id: 'veryFast', value: '10000' },
] as const

export type DanmakuSpeedId = (typeof danmakuSpeedLevels)[number]['id']

export const DEFAULT_DANMAKU_DURATION = '15000'
export const DEFAULT_DANMAKU_SPEED_INDEX = 2

/** 不在档位表内的值取最接近的一档，无法解析时取「适中」 */
export const normalizeDanmakuDuration = (value: unknown): string => {
  const ms = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number.NaN
  if (!Number.isFinite(ms) || ms <= 0) return DEFAULT_DANMAKU_DURATION
  let nearest: (typeof danmakuSpeedLevels)[number] = danmakuSpeedLevels[DEFAULT_DANMAKU_SPEED_INDEX]
  for (const level of danmakuSpeedLevels) {
    if (Math.abs(Number(level.value) - ms) < Math.abs(Number(nearest.value) - ms)) nearest = level
  }
  return nearest.value
}

export const danmakuSpeedIndexOf = (duration: string) => {
  const index = danmakuSpeedLevels.findIndex((level) => level.value === duration)
  return index === -1 ? DEFAULT_DANMAKU_SPEED_INDEX : index
}

/** 弹幕可使用的画面高度比例 */
export const danmakuDisplayAreas = ['0.1', '0.25', '0.5', '0.75', '1'] as const
export const DEFAULT_DANMAKU_DISPLAY_AREA = '0.25'

export const normalizeDanmakuDisplayArea = (value: unknown): string =>
  danmakuDisplayAreas.includes(value as (typeof danmakuDisplayAreas)[number])
    ? (value as string)
    : DEFAULT_DANMAKU_DISPLAY_AREA

/** 已经不再使用、读出后要从存储里删掉的旧字段 */
const LEGACY_APPEARANCE_KEYS = ['danmakuFontSize', 'danmakuMaxOnScreen'] as const

export interface DanmakuAppearanceSettings {
  danmakuFontScale: number
  danmakuDuration: string
  danmakuEndArea: string
}

/**
 * 归一化外观字段并去掉旧字段：字号从像素迁移为百分比，在屏密度不再保存。
 * 其余字段原样保留。
 */
export const normalizeDanmakuAppearance = <T extends object>(
  settings: T,
): Omit<T, (typeof LEGACY_APPEARANCE_KEYS)[number]> & DanmakuAppearanceSettings => {
  const source = settings as Record<string, unknown>
  const next: Record<string, unknown> = { ...source }
  for (const key of LEGACY_APPEARANCE_KEYS) delete next[key]
  next.danmakuFontScale = normalizeDanmakuFontScale(source.danmakuFontScale, source.danmakuFontSize)
  next.danmakuDuration = normalizeDanmakuDuration(source.danmakuDuration)
  next.danmakuEndArea = normalizeDanmakuDisplayArea(source.danmakuEndArea)
  return next as Omit<T, (typeof LEGACY_APPEARANCE_KEYS)[number]> & DanmakuAppearanceSettings
}
