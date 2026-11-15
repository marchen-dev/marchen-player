import { describe, expect, it } from 'vitest'
import { createDisplayTextResolver, lookupTranslation } from '../display-text'
import {
  createDefaultDanmakuTranslationSettings,
  normalizeDanmakuTranslationSettings,
} from '../settings'
import { detectUnsupportedReason } from '../support'
import { TranslationStore } from '../translation-store'

describe('显示文本解析', () => {
  it('有译文显示译文，没有则显示原文', () => {
    const store = new TranslationStore()
    const resolve = createDisplayTextResolver(store)
    expect(resolve({ text: '前方高能' })).toBe('前方高能')

    store.setMany([['前方高能', 'Brace yourselves']])
    expect(resolve({ text: '前方高能' })).toBe('Brace yourselves')
    // 不需要翻译的文本没有译文，原样显示
    expect(resolve({ text: '233333' })).toBe('233333')
  })

  it('繁体、带首尾空白的文本与对应简体共用同一份译文', () => {
    const store = new TranslationStore()
    store.setMany([['这个画面太好了', 'This scene is great']])
    expect(lookupTranslation(store, '這個畫面太好了')).toBe('This scene is great')
    expect(lookupTranslation(store, '  这个画面太好了 ')).toBe('This scene is great')
    expect(lookupTranslation(store, '另一句')).toBeUndefined()
  })

  it('译文到达后同一个解析函数立即读到新结果', () => {
    const store = new TranslationStore()
    const resolve = createDisplayTextResolver(store)
    const item = { text: '泪目' }
    expect(resolve(item)).toBe('泪目')
    store.setMany([['泪目', 'Tears']])
    expect(resolve(item)).toBe('Tears')
  })
})

describe('翻译设置归一化', () => {
  it('默认关闭、目标语言为英文', () => {
    expect(createDefaultDanmakuTranslationSettings()).toEqual({ enabled: false, target: 'en' })
  })

  it('缺字段或类型不对时回落到默认值', () => {
    for (const value of [undefined, null, 'on', 1, [], {}]) {
      expect(normalizeDanmakuTranslationSettings(value)).toEqual({ enabled: false, target: 'en' })
    }
    expect(normalizeDanmakuTranslationSettings({ enabled: 'true' })).toEqual({
      enabled: false,
      target: 'en',
    })
  })

  it('保留合法值，未知目标语言回落到英文', () => {
    expect(normalizeDanmakuTranslationSettings({ enabled: true, target: 'en' })).toEqual({
      enabled: true,
      target: 'en',
    })
    expect(normalizeDanmakuTranslationSettings({ enabled: true, target: 'ja' })).toEqual({
      enabled: true,
      target: 'en',
    })
    expect(normalizeDanmakuTranslationSettings({ enabled: true, target: 'toString' })).toEqual({
      enabled: true,
      target: 'en',
    })
  })
})

describe('环境支持判定', () => {
  const supported = {
    assetsBase: 'https://assets.example.invalid/translation',
    hasWasmSimd: () => true,
    hasWorker: () => true,
    hasDecompression: () => true,
    hasStorage: () => true,
  }

  it('全部满足时支持', () => {
    expect(detectUnsupportedReason(supported)).toBeNull()
  })

  it('逐项给出不支持的原因', () => {
    expect(detectUnsupportedReason({ ...supported, assetsBase: null })).toBe('not_configured')
    expect(detectUnsupportedReason({ ...supported, hasWorker: () => false })).toBe('no_worker')
    expect(detectUnsupportedReason({ ...supported, hasWasmSimd: () => false })).toBe('no_wasm_simd')
    expect(detectUnsupportedReason({ ...supported, hasDecompression: () => false })).toBe(
      'no_decompression',
    )
    expect(detectUnsupportedReason({ ...supported, hasStorage: () => false })).toBe('no_storage')
  })
})
