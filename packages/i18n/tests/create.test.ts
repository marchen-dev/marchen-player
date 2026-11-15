import { describe, expect, it } from 'vitest'
import { createI18n, registerPseudoLanguage } from '../src/create'

describe('i18n 实例', () => {
  it('创建后立刻可用，不需要等待', () => {
    const i18n = createI18n({ language: 'zh-CN' })
    expect(i18n.t('settings:dialog.title')).toBe('设置')
    expect(i18n.t('action.close')).toBe('关闭')
  })

  it('切换语言后同一个 t 返回新语言', async () => {
    const i18n = createI18n({ language: 'zh-CN' })
    await i18n.changeLanguage('en')
    expect(i18n.t('settings:dialog.title')).toBe('Settings')
  })

  it('英文按数量取单复数，中文只有一种形式', async () => {
    const i18n = createI18n({ language: 'en' })
    expect(i18n.t('settings:about.update.etaSeconds', { count: 1 })).toBe('About 1 second')
    expect(i18n.t('settings:about.update.etaSeconds', { count: 30 })).toBe('About 30 seconds')
    await i18n.changeLanguage('zh-CN')
    expect(i18n.t('settings:about.update.etaSeconds', { count: 1 })).toBe('约 1 秒')
  })

  it('当前语言缺文案时回退到简体中文', () => {
    const i18n = createI18n({ language: 'en' })
    i18n.addResourceBundle('zh-CN', 'common', { onlySource: '只有中文' }, true, true)
    // @ts-expect-error 测试专用的键，不在文案类型里
    expect(i18n.t('onlySource')).toBe('只有中文')
  })

  it('只注册指定的命名空间', () => {
    const i18n = createI18n({ language: 'en', namespaces: ['main', 'common'] })
    expect(i18n.t('main:menu.quit', { appName: 'Marchen' })).toBe('Quit Marchen')
    expect(i18n.hasResourceBundle('en', 'settings')).toBe(false)
  })

  it('伪本地化只在显式注册后可用', async () => {
    const i18n = createI18n({ language: 'zh-CN' })
    expect(i18n.hasResourceBundle('pseudo', 'settings')).toBe(false)
    registerPseudoLanguage(i18n)
    await i18n.changeLanguage('pseudo')
    expect(i18n.t('settings:dialog.title')).toMatch(/^\[.+\]$/)
    // 伪本地化文案由英文生成，变量原样保留
    expect(i18n.t('main:menu.quit', { appName: 'Marchen' })).toContain('Marchen')
  })

  it('没有注册伪本地化时，切到它会回退到简体中文而不是显示键名', async () => {
    const i18n = createI18n({ language: 'zh-CN' })
    await i18n.changeLanguage('pseudo')
    expect(i18n.t('settings:dialog.title')).toBe('设置')
  })

  it('伪本地化只覆盖实例注册的命名空间', () => {
    const i18n = createI18n({ language: 'zh-CN', namespaces: ['main', 'common'] })
    registerPseudoLanguage(i18n)
    expect(i18n.hasResourceBundle('pseudo', 'main')).toBe(true)
    expect(i18n.hasResourceBundle('pseudo', 'settings')).toBe(false)
  })

  it('不转义插值内容', () => {
    const i18n = createI18n({ language: 'en' })
    expect(i18n.t('settings:general.network.apiRoute.current', { route: 'A&B' })).toBe(
      'Current route: A&B',
    )
  })
})
