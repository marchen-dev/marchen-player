import type { TranslationPreloadConditions, TranslationPromptConditions } from '../policy'
import { describe, expect, it } from 'vitest'
import {
  shouldAskDanmakuTranslation,
  shouldConfirmTranslationDownload,
  shouldPreloadTranslation,
  translationTargetForLanguage,
} from '../policy'

describe('界面语言对应的翻译目标', () => {
  it('英文界面对应英文，伪本地化按英文，简体中文没有', () => {
    expect(translationTargetForLanguage('en')).toBe('en')
    expect(translationTargetForLanguage('pseudo')).toBe('en')
    expect(translationTargetForLanguage('zh-CN')).toBeNull()
  })
})

describe('是否预下载翻译资源', () => {
  /** 桌面端、英文界面、缺资源：应当预下载的基准情况 */
  const base: TranslationPreloadConditions = {
    uiTarget: 'en',
    supported: true,
    assetsMissing: true,
    optOut: false,
    saveData: false,
    isWeb: false,
    openedVideo: false,
  }

  it('桌面端英文界面缺资源时预下载，不需要打开过视频', () => {
    expect(shouldPreloadTranslation(base)).toBe(true)
  })

  it('简体中文界面不预下载', () => {
    expect(shouldPreloadTranslation({ ...base, uiTarget: null })).toBe(false)
  })

  it('环境不支持、资源已在本机、用户退出过、省流量模式时都不预下载', () => {
    expect(shouldPreloadTranslation({ ...base, supported: false })).toBe(false)
    expect(shouldPreloadTranslation({ ...base, assetsMissing: false })).toBe(false)
    expect(shouldPreloadTranslation({ ...base, optOut: true })).toBe(false)
    expect(shouldPreloadTranslation({ ...base, saveData: true })).toBe(false)
  })

  it('web 端要等到本次运行里打开过视频', () => {
    expect(shouldPreloadTranslation({ ...base, isWeb: true })).toBe(false)
    expect(shouldPreloadTranslation({ ...base, isWeb: true, openedVideo: true })).toBe(true)
  })
})

describe('开启翻译时是否确认下载', () => {
  it('界面语言就是目标语言时不确认', () => {
    expect(
      shouldConfirmTranslationDownload({ uiTarget: 'en', target: 'en', saveData: false }),
    ).toBe(false)
  })

  it('简体中文界面保持确认', () => {
    expect(
      shouldConfirmTranslationDownload({ uiTarget: null, target: 'en', saveData: false }),
    ).toBe(true)
  })

  it('省流量模式下即使界面是目标语言也确认', () => {
    expect(shouldConfirmTranslationDownload({ uiTarget: 'en', target: 'en', saveData: true })).toBe(
      true,
    )
  })
})

describe('是否询问翻译弹幕', () => {
  /** 英文界面、从未选择过、弹幕加载成功：应当询问的基准情况 */
  const base: TranslationPromptConditions = {
    uiTarget: 'en',
    supported: true,
    prompt: 'pending',
    translationEnabled: false,
    askedThisRun: false,
    loaded: true,
    count: 1200,
  }

  it('英文界面首次加载到弹幕时询问', () => {
    expect(shouldAskDanmakuTranslation(base)).toBe(true)
  })

  it('简体中文界面不询问', () => {
    expect(shouldAskDanmakuTranslation({ ...base, uiTarget: null })).toBe(false)
  })

  it('环境不支持时不询问', () => {
    expect(shouldAskDanmakuTranslation({ ...base, supported: false })).toBe(false)
  })

  it('做过选择之后不再询问', () => {
    expect(shouldAskDanmakuTranslation({ ...base, prompt: 'answered' })).toBe(false)
  })

  it('翻译已经开着的老用户视为已选择', () => {
    expect(shouldAskDanmakuTranslation({ ...base, translationEnabled: true })).toBe(false)
  })

  it('同一次运行里只问一次', () => {
    expect(shouldAskDanmakuTranslation({ ...base, askedThisRun: true })).toBe(false)
  })

  it('弹幕加载失败、未匹配或没有弹幕时不询问', () => {
    expect(shouldAskDanmakuTranslation({ ...base, loaded: false })).toBe(false)
    expect(shouldAskDanmakuTranslation({ ...base, count: 0 })).toBe(false)
  })
})
