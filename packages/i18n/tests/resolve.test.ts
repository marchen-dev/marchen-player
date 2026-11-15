import { describe, expect, it } from 'vitest'
import {
  isLanguageSwitchEnabled,
  LANGUAGE_SWITCH_RELEASED,
  normalizeLanguagePreference,
  toLanguageTag,
} from '../src/languages'
import { resolveLanguage } from '../src/resolve'

const enabled = { switchEnabled: true, pseudoEnabled: true }

describe('跟随系统的解析', () => {
  it('简体中文系统用简体中文', () => {
    expect(resolveLanguage('system', ['zh-CN'], enabled)).toBe('zh-CN')
    expect(resolveLanguage('system', ['zh-Hans-CN', 'en-US'], enabled)).toBe('zh-CN')
  })

  it('繁体地区同样用简体中文', () => {
    expect(resolveLanguage('system', ['zh-TW'], enabled)).toBe('zh-CN')
    expect(resolveLanguage('system', ['zh-Hant-HK'], enabled)).toBe('zh-CN')
    expect(resolveLanguage('system', ['zh_TW'], enabled)).toBe('zh-CN')
  })

  it('英文系统用英文', () => {
    expect(resolveLanguage('system', ['en-US'], enabled)).toBe('en')
    expect(resolveLanguage('system', ['EN'], enabled)).toBe('en')
  })

  it('按列表顺序取第一个中文或英文', () => {
    expect(resolveLanguage('system', ['en-US', 'zh-CN'], enabled)).toBe('en')
    expect(resolveLanguage('system', ['zh-CN', 'en-US'], enabled)).toBe('zh-CN')
    // 首选语言不受支持时继续往后找
    expect(resolveLanguage('system', ['ja-JP', 'zh-Hans'], enabled)).toBe('zh-CN')
    expect(resolveLanguage('system', ['ja-JP', 'en-GB', 'zh-CN'], enabled)).toBe('en')
  })

  it('列表里既没有中文也没有英文时用英文', () => {
    expect(resolveLanguage('system', ['ja-JP'], enabled)).toBe('en')
    expect(resolveLanguage('system', ['fr-FR', 'de'], enabled)).toBe('en')
    expect(resolveLanguage('system', [], enabled)).toBe('en')
  })

  it('不把恰好以 zh / en 开头的其他语言当成中文或英文', () => {
    // 壮语（zha）不是中文
    expect(resolveLanguage('system', ['zha'], enabled)).toBe('en')
    expect(resolveLanguage('system', ['enm', 'zh-CN'], enabled)).toBe('zh-CN')
  })
})

describe('显式偏好', () => {
  it('选了具体语言就用它，不看系统语言', () => {
    expect(resolveLanguage('en', ['zh-CN'], enabled)).toBe('en')
    expect(resolveLanguage('zh-CN', ['en-US'], enabled)).toBe('zh-CN')
  })

  it('伪本地化只在允许时生效，否则按跟随系统处理', () => {
    expect(resolveLanguage('pseudo', ['zh-CN'], enabled)).toBe('pseudo')
    expect(resolveLanguage('pseudo', ['en-US'], { switchEnabled: true })).toBe('en')
    expect(
      resolveLanguage('pseudo', ['zh-CN'], { switchEnabled: true, pseudoEnabled: false }),
    ).toBe('zh-CN')
  })
})

describe('发布开关', () => {
  it('未放开时恒为简体中文，忽略系统语言与已保存的偏好', () => {
    const disabled = { switchEnabled: false, pseudoEnabled: true }
    expect(resolveLanguage('system', ['en-US'], disabled)).toBe('zh-CN')
    expect(resolveLanguage('en', ['en-US'], disabled)).toBe('zh-CN')
    expect(resolveLanguage('pseudo', ['en-US'], disabled)).toBe('zh-CN')
  })

  it('开发态始终可以切换，正式构建取决于发布开关', () => {
    expect(isLanguageSwitchEnabled(true)).toBe(true)
    expect(isLanguageSwitchEnabled(false)).toBe(LANGUAGE_SWITCH_RELEASED)
  })
})

describe('偏好归一化', () => {
  it('保留合法值', () => {
    expect(normalizeLanguagePreference('system')).toBe('system')
    expect(normalizeLanguagePreference('zh-CN')).toBe('zh-CN')
    expect(normalizeLanguagePreference('en')).toBe('en')
    expect(normalizeLanguagePreference('pseudo')).toBe('pseudo')
  })

  it('非法值回落到跟随系统', () => {
    expect(normalizeLanguagePreference(undefined)).toBe('system')
    expect(normalizeLanguagePreference('zh-TW')).toBe('system')
    expect(normalizeLanguagePreference(1)).toBe('system')
  })
})

describe('语言标记', () => {
  it('伪本地化按英文处理', () => {
    expect(toLanguageTag('pseudo')).toBe('en')
    expect(toLanguageTag('zh-CN')).toBe('zh-CN')
  })
})
