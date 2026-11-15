import type { MenuItemConstructorOptions } from 'electron'
import { createI18n } from '@marchen/i18n'
import { describe, expect, it, vi } from 'vitest'
import { createAppMenuTemplate } from './menu'

vi.mock('electron', () => ({ Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn() } }))
vi.mock('../lib/env', () => ({ isMacOS: true }))
vi.mock('../lib/i18n', () => ({ t: vi.fn(), onMainLanguageChanged: vi.fn() }))
vi.mock('../lib/update', () => ({ checkForDesktopUpdates: vi.fn() }))
vi.mock('../windows/setting', () => ({
  clearData: vi.fn(),
  createSettingWindow: vi.fn(),
  importAnime: vi.fn(),
  openFeedback: vi.fn(),
}))

/** 取出所有带标题的菜单项标题（含子菜单），忽略分隔线与完全交给系统的角色菜单 */
const labels = (language: 'zh-CN' | 'en') => {
  const i18n = createI18n({ language, namespaces: ['main', 'common'] })
  const collect = (items: MenuItemConstructorOptions[]): string[] =>
    items.flatMap((item) => [
      ...(item.label ? [item.label] : []),
      ...(Array.isArray(item.submenu) ? collect(item.submenu) : []),
    ])
  return collect(createAppMenuTemplate(i18n.t) as MenuItemConstructorOptions[])
}

describe('macOS 应用菜单', () => {
  it('简体中文', () => {
    expect(labels('zh-CN')).toEqual([
      'Marchen',
      '关于 Marchen',
      '检查更新…',
      '反馈问题…',
      '设置...',
      '服务',
      '隐藏 Marchen',
      '隐藏其他',
      '清除数据',
      '退出 Marchen',
      '导入动漫',
      '关闭',
    ])
  })

  it('english', () => {
    expect(labels('en')).toEqual([
      'Marchen',
      'About Marchen',
      'Check for Updates…',
      'Send Feedback…',
      'Settings…',
      'Services',
      'Hide Marchen',
      'Hide Others',
      'Clear Data',
      'Quit Marchen',
      'Import Anime',
      'Close',
    ])
  })

  it('两种语言的菜单项数量一致，没有残留另一种语言的文字', () => {
    expect(labels('en')).toHaveLength(labels('zh-CN').length)
    expect(labels('en').join('')).not.toMatch(/\p{Script=Han}/u)
  })
})
