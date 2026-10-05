/**
 * 弹幕屏蔽的规则解析与判定，全部为纯函数。
 *
 * 渲染器与弹幕列表各自持有不同 id 空间的弹幕副本，但都通过这里的同一个 blocker 判定，
 * 因此两处对「哪些弹幕被屏蔽」的结论必然一致。判定只影响显示，原始弹幕不被改写。
 */
import type { DanmakuItem, DanmakuMode } from '@marchen/danmaku-engine'
import type { DanmakuBlockRule, DanmakuBlockSettings } from './danmaku-block-settings'

import {
  DANMAKU_BLOCK_MODES,
  isSameDanmakuBlockRule,
  MAX_DANMAKU_BLOCK_KEYWORD_LENGTH,
  MAX_DANMAKU_BLOCK_RULES,
} from './danmaku-block-settings'
import { toSimplified } from './traditional-to-simplified'

/**
 * 匹配用的归一化：转简体并转小写。
 * 与「繁体转简体」显示开关无关，保证用户写的简体关键词在开关关闭时也能命中繁体弹幕。
 */
export const normalizeBlockText = (text: string) => toSimplified(text).toLowerCase()

export type BlockRuleParseResult =
  | { ok: true; rule: DanmakuBlockRule }
  | { ok: false; reason: 'empty' | 'too_long' | 'invalid_regex'; message: string }

/** 正则固定忽略大小写。不加 u：`\-` 这类常见写法在 Unicode 模式下会被判为非法 */
const compileRegex = (pattern: string) => new RegExp(pattern, 'i')

/**
 * 解析用户在输入框里提交的内容。
 * 以 `/` 开头并以 `/` 结尾、且中间至少一个字符时识别为正则，其余一律按关键词处理。
 */
export const parseBlockRuleInput = (input: string): BlockRuleParseResult => {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, reason: 'empty', message: '请输入要屏蔽的内容' }

  if (trimmed.length >= 3 && trimmed.startsWith('/') && trimmed.endsWith('/')) {
    const pattern = trimmed.slice(1, -1)
    try {
      compileRegex(pattern)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return { ok: false, reason: 'invalid_regex', message: `正则无效：${detail}` }
    }
    return { ok: true, rule: { type: 'regex', pattern } }
  }

  const pattern = normalizeBlockText(trimmed)
  if (pattern.length > MAX_DANMAKU_BLOCK_KEYWORD_LENGTH) {
    return {
      ok: false,
      reason: 'too_long',
      message: `关键词不能超过 ${MAX_DANMAKU_BLOCK_KEYWORD_LENGTH} 个字符`,
    }
  }
  return { ok: true, rule: { type: 'keyword', pattern } }
}

/**
 * 把一条弹幕的文本直接转成关键词规则，用于「屏蔽这条弹幕」。
 * 不走输入解析：弹幕文本即使长得像 `/…/` 也必须按字面屏蔽；超长时取前缀，子串匹配仍能命中原弹幕。
 */
export const createKeywordRuleFromText = (text: string): DanmakuBlockRule | null => {
  const pattern = normalizeBlockText(text.trim()).slice(0, MAX_DANMAKU_BLOCK_KEYWORD_LENGTH)
  return pattern ? { type: 'keyword', pattern } : null
}

export const formatBlockRule = (rule: DanmakuBlockRule) =>
  rule.type === 'regex' ? `/${rule.pattern}/` : rule.pattern

export type AddBlockRuleResult =
  { status: 'added'; settings: DanmakuBlockSettings } | { status: 'exists' } | { status: 'limit' }

/** 追加一条规则；重复与达到上限时不改动设置，由调用方决定如何提示 */
export const addBlockRule = (
  settings: DanmakuBlockSettings,
  rule: DanmakuBlockRule,
): AddBlockRuleResult => {
  if (settings.rules.some((existing) => isSameDanmakuBlockRule(existing, rule)))
    return { status: 'exists' }
  if (settings.rules.length >= MAX_DANMAKU_BLOCK_RULES) return { status: 'limit' }
  return { status: 'added', settings: { ...settings, rules: [...settings.rules, rule] } }
}

export const removeBlockRule = (
  settings: DanmakuBlockSettings,
  rule: DanmakuBlockRule,
): DanmakuBlockSettings => ({
  ...settings,
  rules: settings.rules.filter((existing) => !isSameDanmakuBlockRule(existing, rule)),
})

export type BlockTextResult =
  | {
      status: 'blocked'
      rule: DanmakuBlockRule
      settings: DanmakuBlockSettings
      /** 撤销：基于调用时的最新设置做逆操作，不整体回写旧设置，避免覆盖期间的其他改动 */
      revert: (current: DanmakuBlockSettings) => DanmakuBlockSettings
    }
  | { status: 'empty' }
  | { status: 'limit' }

/**
 * 「屏蔽这条弹幕」的状态变更：把文本加为关键词规则，总开关关闭时一并打开（否则操作没有可见效果）。
 * 撤销只移除本次新增的规则；规则在操作前就存在时不动它，总开关恢复为操作前的状态。
 */
export const blockDanmakuText = (settings: DanmakuBlockSettings, text: string): BlockTextResult => {
  const rule = createKeywordRuleFromText(text)
  if (!rule) return { status: 'empty' }

  const added = addBlockRule(settings, rule)
  if (added.status === 'limit') return { status: 'limit' }

  const wasEnabled = settings.enabled
  const ruleAdded = added.status === 'added'
  const base = ruleAdded ? added.settings : settings
  return {
    status: 'blocked',
    rule,
    settings: wasEnabled ? base : { ...base, enabled: true },
    revert: (current) => ({
      ...(ruleAdded ? removeBlockRule(current, rule) : current),
      enabled: wasEnabled ? current.enabled : false,
    }),
  }
}

export type DanmakuBlockHit =
  { kind: 'mode'; mode: DanmakuMode } | { kind: 'rule'; rule: DanmakuBlockRule }

const MODE_NAMES: Record<DanmakuMode, string> = { scroll: '滚动', top: '顶部', bottom: '底部' }

export const describeBlockHit = (hit: DanmakuBlockHit) => {
  if (hit.kind === 'mode') return `已屏蔽${MODE_NAMES[hit.mode]}弹幕`
  return hit.rule.type === 'regex'
    ? `命中正则 ${formatBlockRule(hit.rule)}`
    : `命中关键词「${hit.rule.pattern}」`
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 判定对象：归一化后的文本与弹幕类型 */
export interface DanmakuBlockTarget {
  text: string
  mode: DanmakuMode
}

export type DanmakuBlocker = (target: DanmakuBlockTarget) => DanmakuBlockHit | null

/**
 * 根据设置生成判定函数。总开关关闭或没有任何生效项时返回 null，调用方可以整体跳过判定。
 */
export const createDanmakuBlocker = (settings: DanmakuBlockSettings): DanmakuBlocker | null => {
  if (!settings.enabled) return null

  const blockedModes = new Set(DANMAKU_BLOCK_MODES.filter((mode) => settings.modes[mode]))
  const keywords: DanmakuBlockRule[] = []
  const regexes: Array<{ rule: DanmakuBlockRule; regex: RegExp }> = []
  for (const rule of settings.rules) {
    if (rule.type === 'keyword') {
      keywords.push(rule)
      continue
    }
    try {
      regexes.push({ rule, regex: compileRegex(rule.pattern) })
    } catch {
      // 入库前已校验，这里只防存档被外部改坏：跳过坏规则，不让它废掉其余屏蔽
    }
  }
  if (blockedModes.size === 0 && keywords.length === 0 && regexes.length === 0) return null

  // 绝大多数弹幕不命中任何关键词。先用一个合并的正则整体排除，命中后才逐条找出具体规则；
  // 关键词达到数百条时，逐条 includes 的耗时是合并正则的数倍（见变更目录下的基准记录）。
  const anyKeyword =
    keywords.length > 0
      ? new RegExp(keywords.map((rule) => escapeRegex(rule.pattern)).join('|'))
      : null

  return ({ text, mode }) => {
    if (blockedModes.has(mode)) return { kind: 'mode', mode }
    if (anyKeyword?.test(text)) {
      for (const rule of keywords) {
        if (text.includes(rule.pattern)) return { kind: 'rule', rule }
      }
    }
    for (const { rule, regex } of regexes) {
      if (regex.test(text)) return { kind: 'rule', rule }
    }
    return null
  }
}

/**
 * 为整组弹幕预计算归一化文本，结果与入参一一对应。
 * 只依赖弹幕本身，调用方应按弹幕数组缓存，规则变化时不必重做简繁转换。
 * 弹幕大量重复，先用本地表去重；toSimplified 自带的缓存有容量上限且会整体清空，不适合承担这份缓存。
 */
export const prepareBlockTexts = (items: ReadonlyArray<Pick<DanmakuItem, 'text'>>): string[] => {
  const cache = new Map<string, string>()
  return items.map(({ text }) => {
    let normalized = cache.get(text)
    if (normalized === undefined) {
      normalized = normalizeBlockText(text)
      cache.set(text, normalized)
    }
    return normalized
  })
}

const EMPTY_BLOCKED_IDS: ReadonlySet<string> = new Set()

/** 计算被屏蔽的弹幕 id 集合；texts 须为同一组弹幕经 prepareBlockTexts 得到的结果 */
export const collectBlockedIds = (
  items: ReadonlyArray<Pick<DanmakuItem, 'id' | 'mode'>>,
  texts: ReadonlyArray<string>,
  blocker: DanmakuBlocker | null,
): ReadonlySet<string> => {
  if (!blocker) return EMPTY_BLOCKED_IDS
  const blocked = new Set<string>()
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!
    if (blocker({ text: texts[index] ?? '', mode: item.mode })) blocked.add(item.id)
  }
  return blocked.size > 0 ? blocked : EMPTY_BLOCKED_IDS
}
