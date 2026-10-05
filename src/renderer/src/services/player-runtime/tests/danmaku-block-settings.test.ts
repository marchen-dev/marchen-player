import { describe, expect, it } from 'vitest'

import {
  createDefaultDanmakuBlockSettings,
  MAX_DANMAKU_BLOCK_KEYWORD_LENGTH,
  MAX_DANMAKU_BLOCK_RULES,
  normalizeDanmakuBlockSettings,
} from '../danmaku/danmaku-block-settings'

describe('弹幕屏蔽设置归一化', () => {
  it('旧存档没有该字段时回落到默认值', () => {
    expect(normalizeDanmakuBlockSettings(undefined)).toEqual(createDefaultDanmakuBlockSettings())
    expect(normalizeDanmakuBlockSettings('broken')).toEqual(createDefaultDanmakuBlockSettings())
  })

  it('默认开启总开关、不屏蔽任何类型、没有规则', () => {
    expect(createDefaultDanmakuBlockSettings()).toEqual({
      enabled: true,
      modes: { scroll: false, top: false, bottom: false },
      rules: [],
    })
  })

  it('缺失的字段逐项补默认值，已有的值保留', () => {
    expect(normalizeDanmakuBlockSettings({ enabled: false, modes: { top: true } })).toEqual({
      enabled: false,
      modes: { scroll: false, top: true, bottom: false },
      rules: [],
    })
  })

  it('丢弃结构非法的规则', () => {
    const result = normalizeDanmakuBlockSettings({
      rules: [
        { type: 'keyword', pattern: '剧透' },
        { type: 'user', pattern: 'abc' },
        { type: 'keyword', pattern: '' },
        { type: 'regex' },
        { type: 'keyword', pattern: 'x'.repeat(MAX_DANMAKU_BLOCK_KEYWORD_LENGTH + 1) },
        null,
        '剧透',
      ],
    })
    expect(result.rules).toEqual([{ type: 'keyword', pattern: '剧透' }])
  })

  it('内容相同的规则只保留一条，类型不同视为不同规则', () => {
    const result = normalizeDanmakuBlockSettings({
      rules: [
        { type: 'keyword', pattern: 'abc' },
        { type: 'keyword', pattern: 'abc' },
        { type: 'regex', pattern: 'abc' },
      ],
    })
    expect(result.rules).toEqual([
      { type: 'keyword', pattern: 'abc' },
      { type: 'regex', pattern: 'abc' },
    ])
  })

  it('规则数量截断到上限', () => {
    const rules = Array.from({ length: MAX_DANMAKU_BLOCK_RULES + 20 }, (_, index) => ({
      type: 'keyword',
      pattern: `关键词${index}`,
    }))
    const result = normalizeDanmakuBlockSettings({ rules })
    expect(result.rules).toHaveLength(MAX_DANMAKU_BLOCK_RULES)
    expect(result.rules.at(-1)).toEqual({
      type: 'keyword',
      pattern: `关键词${MAX_DANMAKU_BLOCK_RULES - 1}`,
    })
  })
})
