import type { DanmakuItem } from '@marchen/danmaku-engine'
import type { DanmakuBlockSettings } from '../danmaku/danmaku-block-settings'
import { describe, expect, it } from 'vitest'

import {
  addBlockRule,
  blockDanmakuText,
  collectBlockedIds,
  createDanmakuBlocker,
  createKeywordRuleFromText,
  describeBlockHit,
  formatBlockRule,
  normalizeBlockText,
  parseBlockRuleInput,
  prepareBlockTexts,
  removeBlockRule,
} from '../danmaku/danmaku-block'
import {
  createDefaultDanmakuBlockSettings,
  MAX_DANMAKU_BLOCK_KEYWORD_LENGTH,
  MAX_DANMAKU_BLOCK_RULES,
} from '../danmaku/danmaku-block-settings'

const settingsWith = (patch: Partial<DanmakuBlockSettings>): DanmakuBlockSettings => ({
  ...createDefaultDanmakuBlockSettings(),
  ...patch,
})

const item = (id: string, text: string, mode: DanmakuItem['mode'] = 'scroll'): DanmakuItem => ({
  id,
  time: 0,
  text,
  mode,
  color: '#ffffff',
})

/** 与渲染器、弹幕列表相同的调用方式：先归一化文本，再逐条判定 */
const blockedIds = (settings: DanmakuBlockSettings, items: DanmakuItem[]) => [
  ...collectBlockedIds(items, prepareBlockTexts(items), createDanmakuBlocker(settings)),
]

describe('屏蔽规则输入解析', () => {
  it('普通输入识别为关键词，并转简体、转小写、去首尾空白', () => {
    expect(parseBlockRuleInput('  劇透 AWSL ')).toEqual({
      ok: true,
      rule: { type: 'keyword', pattern: '剧透 awsl' },
    })
  })

  it('拒绝空内容', () => {
    expect(parseBlockRuleInput('   ')).toMatchObject({ ok: false, reason: 'empty' })
  })

  it('拒绝超长关键词', () => {
    expect(parseBlockRuleInput('x'.repeat(MAX_DANMAKU_BLOCK_KEYWORD_LENGTH + 1))).toMatchObject({
      ok: false,
      reason: 'too_long',
    })
  })

  it('两端带斜杠且中间有内容时识别为正则，保留原文', () => {
    expect(parseBlockRuleInput('/^2{3,}$/')).toEqual({
      ok: true,
      rule: { type: 'regex', pattern: '^2{3,}$' },
    })
  })

  it('非法正则被拒绝并给出原因', () => {
    const result = parseBlockRuleInput('/(abc/')
    expect(result).toMatchObject({ ok: false, reason: 'invalid_regex' })
    expect(result.ok ? '' : result.message).toContain('正则无效')
  })

  it('不完整的斜杠写法按关键词处理', () => {
    expect(parseBlockRuleInput('/abc')).toEqual({
      ok: true,
      rule: { type: 'keyword', pattern: '/abc' },
    })
    expect(parseBlockRuleInput('//')).toEqual({
      ok: true,
      rule: { type: 'keyword', pattern: '//' },
    })
  })

  it('不支持自定义修饰符，带修饰符的写法按关键词处理', () => {
    expect(parseBlockRuleInput('/abc/i')).toEqual({
      ok: true,
      rule: { type: 'keyword', pattern: '/abc/i' },
    })
  })
})

describe('由弹幕文本生成关键词规则', () => {
  it('长得像正则的弹幕文本仍按字面生成关键词', () => {
    expect(createKeywordRuleFromText('/草/')).toEqual({ type: 'keyword', pattern: '/草/' })
  })

  it('超长文本取前缀，空文本不生成规则', () => {
    const rule = createKeywordRuleFromText('啊'.repeat(MAX_DANMAKU_BLOCK_KEYWORD_LENGTH + 50))
    expect(rule?.pattern).toHaveLength(MAX_DANMAKU_BLOCK_KEYWORD_LENGTH)
    expect(createKeywordRuleFromText('   ')).toBeNull()
  })
})

describe('弹幕屏蔽判定', () => {
  it('关键词按子串命中', () => {
    const settings = settingsWith({ rules: [{ type: 'keyword', pattern: '剧透' }] })
    expect(blockedIds(settings, [item('a', '前面有剧透，慎看'), item('b', '作画好强')])).toEqual([
      'a',
    ])
  })

  it('简体关键词命中繁体弹幕', () => {
    const settings = settingsWith({ rules: [{ type: 'keyword', pattern: '剧透' }] })
    expect(blockedIds(settings, [item('a', '劇透注意')])).toEqual(['a'])
  })

  it('关键词忽略大小写', () => {
    const settings = settingsWith({ rules: [{ type: 'keyword', pattern: 'awsl' }] })
    expect(blockedIds(settings, [item('a', 'AWSL')])).toEqual(['a'])
  })

  it('关键词中的正则特殊字符按字面匹配', () => {
    const settings = settingsWith({
      rules: [
        { type: 'keyword', pattern: '(笑)' },
        { type: 'keyword', pattern: 'a.c' },
      ],
    })
    expect(
      blockedIds(settings, [
        item('a', '好活(笑)'),
        item('b', 'abc'),
        item('c', 'a.c'),
        item('d', '笑'),
      ]),
    ).toEqual(['a', 'c'])
  })

  it('正则在归一化文本上匹配并忽略大小写', () => {
    const settings = settingsWith({
      rules: [
        { type: 'regex', pattern: '^2{3,}$' },
        { type: 'regex', pattern: '^WWW+$' },
      ],
    })
    expect(
      blockedIds(settings, [
        item('a', '2333'),
        item('b', '222'),
        item('c', '22'),
        item('d', 'wwww'),
        item('e', '劇透'),
      ]),
    ).toEqual(['b', 'd'])
  })

  it('按类型屏蔽只影响对应类型', () => {
    const settings = settingsWith({ modes: { scroll: false, top: true, bottom: false } })
    expect(
      blockedIds(settings, [item('a', '顶', 'top'), item('b', '滚'), item('c', '底', 'bottom')]),
    ).toEqual(['a'])
  })

  it('总开关关闭时规则与类型屏蔽都不生效', () => {
    const settings = settingsWith({
      enabled: false,
      modes: { scroll: true, top: true, bottom: true },
      rules: [{ type: 'keyword', pattern: '剧透' }],
    })
    expect(createDanmakuBlocker(settings)).toBeNull()
    expect(blockedIds(settings, [item('a', '剧透')])).toEqual([])
  })

  it('没有任何生效项时不生成判定函数', () => {
    expect(createDanmakuBlocker(createDefaultDanmakuBlockSettings())).toBeNull()
  })

  it('存档里的坏正则被跳过，不影响其他规则', () => {
    const settings = settingsWith({
      rules: [
        { type: 'regex', pattern: '(abc' },
        { type: 'keyword', pattern: '剧透' },
      ],
    })
    expect(blockedIds(settings, [item('a', '剧透'), item('b', '(abc')])).toEqual(['a'])
  })

  it('命中信息区分类型、关键词与正则', () => {
    const blocker = createDanmakuBlocker(
      settingsWith({
        modes: { scroll: false, top: true, bottom: false },
        rules: [
          { type: 'keyword', pattern: '剧透' },
          { type: 'regex', pattern: '^草+$' },
        ],
      }),
    )!
    const describe = (text: string, mode: DanmakuItem['mode'] = 'scroll') => {
      const hit = blocker({ text: normalizeBlockText(text), mode })
      return hit ? describeBlockHit(hit) : null
    }
    expect(describe('随便', 'top')).toBe('已屏蔽顶部弹幕')
    expect(describe('劇透')).toBe('命中关键词「剧透」')
    expect(describe('草草草')).toBe('命中正则 /^草+$/')
    expect(describe('作画好强')).toBeNull()
  })

  it('正则规则显示时带斜杠', () => {
    expect(formatBlockRule({ type: 'regex', pattern: 'a+' })).toBe('/a+/')
    expect(formatBlockRule({ type: 'keyword', pattern: 'a+' })).toBe('a+')
  })
})

describe('规则增删', () => {
  const keyword = (pattern: string) => ({ type: 'keyword' as const, pattern })
  const fullRules = () =>
    Array.from({ length: MAX_DANMAKU_BLOCK_RULES }, (_, index) => keyword(`词${index}`))

  it('追加新规则，重复规则不新增', () => {
    const added = addBlockRule(createDefaultDanmakuBlockSettings(), keyword('剧透'))
    expect(added).toMatchObject({ status: 'added', settings: { rules: [keyword('剧透')] } })
    expect(addBlockRule(settingsWith({ rules: [keyword('剧透')] }), keyword('剧透'))).toEqual({
      status: 'exists',
    })
  })

  it('达到上限后拒绝新增', () => {
    expect(addBlockRule(settingsWith({ rules: fullRules() }), keyword('新词'))).toEqual({
      status: 'limit',
    })
  })

  it('移除规则只影响目标规则', () => {
    const settings = settingsWith({ rules: [keyword('a'), { type: 'regex', pattern: 'a' }] })
    expect(removeBlockRule(settings, keyword('a')).rules).toEqual([{ type: 'regex', pattern: 'a' }])
  })

  describe('屏蔽一条弹幕', () => {
    it('把弹幕文本加为关键词规则，撤销后移除', () => {
      const result = blockDanmakuText(createDefaultDanmakuBlockSettings(), '前方高能')
      if (result.status !== 'blocked') throw new Error('应当屏蔽成功')
      expect(result.settings.rules).toEqual([keyword('前方高能')])
      expect(result.revert(result.settings)).toEqual(createDefaultDanmakuBlockSettings())
    })

    it('总开关关闭时一并开启，撤销后恢复为关闭', () => {
      const result = blockDanmakuText(settingsWith({ enabled: false }), '前方高能')
      if (result.status !== 'blocked') throw new Error('应当屏蔽成功')
      expect(result.settings.enabled).toBe(true)
      expect(result.revert(result.settings)).toEqual(settingsWith({ enabled: false }))
    })

    it('规则已存在时不重复添加，撤销也不移除原有规则', () => {
      const settings = settingsWith({ enabled: false, rules: [keyword('前方高能')] })
      const result = blockDanmakuText(settings, '前方高能')
      if (result.status !== 'blocked') throw new Error('应当屏蔽成功')
      expect(result.settings).toEqual(settingsWith({ rules: [keyword('前方高能')] }))
      expect(result.revert(result.settings)).toEqual(settings)
    })

    it('撤销不覆盖期间新增的其他规则', () => {
      const result = blockDanmakuText(createDefaultDanmakuBlockSettings(), '前方高能')
      if (result.status !== 'blocked') throw new Error('应当屏蔽成功')
      const later = { ...result.settings, rules: [...result.settings.rules, keyword('剧透')] }
      expect(result.revert(later).rules).toEqual([keyword('剧透')])
    })

    it('达到上限或文本为空时不改动设置', () => {
      expect(blockDanmakuText(settingsWith({ rules: fullRules() }), '新词')).toEqual({
        status: 'limit',
      })
      expect(blockDanmakuText(createDefaultDanmakuBlockSettings(), '  ')).toEqual({
        status: 'empty',
      })
    })
  })
})
