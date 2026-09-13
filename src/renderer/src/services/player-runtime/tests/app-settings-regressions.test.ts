import { readFileSync } from 'node:fs'
import {
  APP_SETTINGS_SECTIONS,
  DEFAULT_APP_SETTINGS_SECTION,
  resolveAppSettingsSection,
} from '@marchen/shared/types/renderer-handlers'
import { describe, expect, it } from 'vitest'

const readRendererSource = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')

describe('应用设置重构回归', () => {
  it('只暴露三个稳定分类 ID，并安全回退到通用', () => {
    expect(APP_SETTINGS_SECTIONS).toEqual(['general', 'ai', 'about'])
    expect(DEFAULT_APP_SETTINGS_SECTION).toBe('general')
    expect(resolveAppSettingsSection()).toBe('general')
    expect(resolveAppSettingsSection('about')).toBe('about')
    expect(resolveAppSettingsSection('播放器')).toBe('general')
    expect(resolveAppSettingsSection({ id: 'ai' })).toBe('general')
  })

  it('分类配置删除播放器入口并使用组件引用而非 ReactNode 身份', () => {
    const source = readRendererSource('components/modules/settings/tabs.tsx')
    expect(source).toContain("id: 'general'")
    expect(source).toContain("id: 'ai'")
    expect(source).toContain("id: 'about'")
    expect(source).not.toContain('PlayerView')
    expect(source).not.toContain('component: <')
  })

  it('固定弹窗先切换分类，再复用唯一设置 ID', () => {
    const hookSource = readRendererSource('components/modules/settings/hooks.tsx')
    expect(hookSource.indexOf('setCurrentSetting(section)')).toBeLessThan(
      hookSource.indexOf('present({'),
    )
    expect(hookSource).toContain("id: 'SETTING'")
    expect(hookSource).toContain('CustomModalComponent: AppSettingsDialogShell')

    const listenerSource = readRendererSource('providers/IpcListener.tsx')
    expect(listenerSource.match(/showSetting\.listen/g)).toHaveLength(1)
    expect(listenerSource).toContain('showModal(section)')
  })

  it('纵向 Tabs 和设置行保留键盘、关联与滚动契约', () => {
    const modalSource = readRendererSource('components/modules/settings/index.tsx')
    expect(modalSource).toContain('orientation="vertical"')
    expect(modalSource).toContain('value={currentSection}')
    expect(modalSource).toContain('viewport?.scrollTo({ top: 0 })')

    const componentsSource = readRendererSource('components/modules/settings/components.tsx')
    expect(componentsSource).toContain('app-settings-scroll-viewport')
    expect(componentsSource).toContain('id={labelId}')
    expect(componentsSource).toContain('id={descriptionId}')
  })

  it('ai 条目使用 radio 语义、文字状态和具名操作', () => {
    const source = readRendererSource('components/modules/settings/views/ai/ProviderCard.tsx')
    expect(source).toContain('role="radio"')
    expect(source).toContain('aria-checked={isActive}')
    expect(source).toContain('>当前</span>')
    expect(source).toMatch(/aria-label=\{`编辑服务商：\$\{provider\.name\}`\}/)
    expect(source).toMatch(/aria-label=\{`删除服务商：\$\{provider\.name\}`\}/)
    expect(source.match(/truncate/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('主题偏好受控，实际资源使用 resolvedTheme，设置材质隔离到专属作用域', () => {
    const toggleSource = readRendererSource(
      'components/modules/settings/views/general/DarkMode.tsx',
    )
    expect(toggleSource).toContain('value={theme}')
    expect(toggleSource).not.toContain('defaultValue={theme}')

    const themeSource = readRendererSource('hooks/theme.ts')
    expect(themeSource).toContain('resolvedTheme')
    expect(themeSource).toContain("const isDarkMode = effectiveTheme === 'dark'")

    const css = readRendererSource('styles/settings.css')
    expect(css).toContain('[data-app-settings]')
    expect(css).toContain('.dark [data-app-settings]')
    expect(css).toContain('width: min(840px, calc(100vw - 48px))')
    expect(css).toContain('height: min(600px, calc(100vh - 48px))')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
