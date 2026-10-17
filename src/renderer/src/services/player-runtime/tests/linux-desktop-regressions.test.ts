import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

const readRendererSource = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')

/** utils 在模块初始化时读取平台，需先注入 window 再动态导入 */
const loadUtils = async (platform: string) => {
  vi.resetModules()
  vi.stubGlobal('window', {
    electron: {},
    platform,
    navigator: { userAgent: '', platform: '' },
  })
  return import('@renderer/lib/utils')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('linux 桌面端回归', () => {
  it('透明拖拽层只服务 macOS，Linux 原生标题栏下不拦截顶部点击', () => {
    const source = readRendererSource('components/modules/app/Prepare.tsx')
    expect(source).toContain('if (!isMac) return null')
    expect(source).not.toContain('isWindows')
  })

  it.each([
    ['darwin', '在 Finder 中显示'],
    ['win32', '在资源管理器中显示'],
    ['linux', '在文件管理器中显示'],
  ])('%s 的文件定位文案', async (platform, label) => {
    const { getRevealInFileManagerLabel } = await loadUtils(platform)
    expect(getRevealInFileManagerLabel()).toBe(label)
  })

  it('历史记录与影视库右键菜单共用平台文案', () => {
    for (const path of [
      'components/modules/history/HistoryRecordContextMenu.tsx',
      'page/library/LibraryCardContextMenu.tsx',
    ]) {
      const source = readRendererSource(path)
      expect(source).toContain('getRevealInFileManagerLabel()')
      expect(source).not.toContain("'在 Finder 中显示'")
    }
  })
})
