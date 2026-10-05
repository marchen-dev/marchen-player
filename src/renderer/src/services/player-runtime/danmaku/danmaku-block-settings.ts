/**
 * 弹幕屏蔽设置的数据模型与结构归一化。
 *
 * 这里刻意不依赖 OpenCC：设置 atom 在应用启动时就会读取并归一化存档，
 * 简繁字典只应在真正需要匹配弹幕时才初始化。文本层面的归一化（转简体、转小写）
 * 在规则入库时由 danmaku-block.ts 完成，本文件只负责结构校验、去重与数量上限。
 */
import type { DanmakuMode } from '@marchen/danmaku-engine'

/** 规则以「类型 + 内容」为身份，不另设 id */
export interface DanmakuBlockRule {
  type: 'keyword' | 'regex'
  /** 关键词为归一化后的文本；正则为两个斜杠之间的原文 */
  pattern: string
}

export interface DanmakuBlockSettings {
  /** 总开关：关闭后规则与类型屏蔽都不生效，但保留且可编辑 */
  enabled: boolean
  modes: Record<DanmakuMode, boolean>
  rules: DanmakuBlockRule[]
}

export const MAX_DANMAKU_BLOCK_RULES = 500
export const MAX_DANMAKU_BLOCK_KEYWORD_LENGTH = 200

export const DANMAKU_BLOCK_MODES = ['scroll', 'top', 'bottom'] as const satisfies DanmakuMode[]

export const createDefaultDanmakuBlockSettings = (): DanmakuBlockSettings => ({
  enabled: true,
  modes: { scroll: false, top: false, bottom: false },
  rules: [],
})

export const isSameDanmakuBlockRule = (left: DanmakuBlockRule, right: DanmakuBlockRule) =>
  left.type === right.type && left.pattern === right.pattern

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizeRule = (value: unknown): DanmakuBlockRule | null => {
  if (!isRecord(value)) return null
  const { type, pattern } = value
  if (type !== 'keyword' && type !== 'regex') return null
  if (typeof pattern !== 'string' || pattern.length === 0) return null
  if (type === 'keyword' && pattern.length > MAX_DANMAKU_BLOCK_KEYWORD_LENGTH) return null
  return { type, pattern }
}

/**
 * 存档可能来自旧版本（没有该字段）或被外部改坏，逐项回落到默认值，
 * 丢弃非法与重复的规则，并截断到数量上限。
 */
export const normalizeDanmakuBlockSettings = (value: unknown): DanmakuBlockSettings => {
  const defaults = createDefaultDanmakuBlockSettings()
  if (!isRecord(value)) return defaults

  const modes = isRecord(value.modes) ? value.modes : {}
  const rules: DanmakuBlockRule[] = []
  for (const candidate of Array.isArray(value.rules) ? value.rules : []) {
    if (rules.length >= MAX_DANMAKU_BLOCK_RULES) break
    const rule = normalizeRule(candidate)
    if (rule && !rules.some((existing) => isSameDanmakuBlockRule(existing, rule))) rules.push(rule)
  }

  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : defaults.enabled,
    modes: {
      scroll: modes.scroll === true,
      top: modes.top === true,
      bottom: modes.bottom === true,
    },
    rules,
  }
}
