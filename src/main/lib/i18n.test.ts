import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LANGUAGE_SWITCH_RELEASED } from '@marchen/i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  env: { isDev: true },
  userData: '',
  systemLanguages: ['zh-CN'] as string[],
  systemLanguagesThrows: false,
  writeLog: vi.fn(),
}))
vi.mock('electron', () => ({
  app: {
    getPath: () => mocks.userData,
    getPreferredSystemLanguages: () => {
      if (mocks.systemLanguagesThrows) throw new Error('not ready')
      return mocks.systemLanguages
    },
  },
}))
vi.mock('./env', () => mocks.env)
vi.mock('./diagnostic-log', () => ({ writeLog: mocks.writeLog }))

const mirror = () => join(mocks.userData, 'language.json')
const readMirror = () => (existsSync(mirror()) ? JSON.parse(readFileSync(mirror(), 'utf8')) : null)
/** 模块在加载时读取开发态标记并缓存实例，每个用例重新加载一次 */
const load = async () => {
  vi.resetModules()
  return import('./i18n')
}
const quit = (t: (key: 'main:menu.quit', options: { appName: string }) => string) =>
  t('main:menu.quit', { appName: 'Marchen' })

beforeEach(() => {
  mocks.userData = mkdtempSync(join(tmpdir(), 'marchen-main-i18n-'))
  mocks.env.isDev = true
  mocks.systemLanguages = ['zh-CN']
  mocks.systemLanguagesThrows = false
  mocks.writeLog.mockClear()
})
afterEach(() => rmSync(mocks.userData, { recursive: true, force: true }))

describe('主进程启动时的语言', () => {
  it('有镜像时用镜像，不看系统语言', async () => {
    writeFileSync(mirror(), '{"language":"en"}')
    const { t } = await load()
    expect(quit(t)).toBe('Quit Marchen')
  })

  it('没有镜像时按系统语言解析', async () => {
    mocks.systemLanguages = ['en-US']
    expect(quit((await load()).t)).toBe('Quit Marchen')
    mocks.systemLanguages = ['zh-Hant-TW']
    expect(quit((await load()).t)).toBe('退出 Marchen')
  })

  it('取不到系统语言时不抛出，按空列表解析为英文', async () => {
    mocks.systemLanguagesThrows = true
    const { t, getSystemLanguages } = await load()
    expect(getSystemLanguages()).toEqual([])
    expect(quit(t)).toBe('Quit Marchen')
  })

  it('镜像损坏时按系统语言解析', async () => {
    writeFileSync(mirror(), '{"language":"ja"}')
    expect(quit((await load()).t)).toBe('退出 Marchen')
  })
})

describe('页面上报语言', () => {
  it('切换语言、通知订阅者并写入镜像', async () => {
    const { t, setMainLanguage, onMainLanguageChanged } = await load()
    const listener = vi.fn()
    onMainLanguageChanged(listener)
    setMainLanguage('en')
    expect(quit(t)).toBe('Quit Marchen')
    expect(listener).toHaveBeenCalledOnce()
    expect(readMirror()).toEqual({ language: 'en' })
  })

  it('语言没变时不重复通知，但会补写缺失的镜像', async () => {
    const { setMainLanguage, onMainLanguageChanged } = await load()
    const listener = vi.fn()
    onMainLanguageChanged(listener)
    setMainLanguage('zh-CN')
    expect(listener).not.toHaveBeenCalled()
    expect(readMirror()).toEqual({ language: 'zh-CN' })
  })

  it('忽略未知的输入', async () => {
    const { t, setMainLanguage } = await load()
    for (const input of ['ja', 'pseudo', '', null, undefined, 1, { language: 'en' }]) {
      setMainLanguage(input)
    }
    expect(quit(t)).toBe('退出 Marchen')
    expect(readMirror()).toBeNull()
  })

  it('取消订阅后不再收到通知', async () => {
    const { setMainLanguage, onMainLanguageChanged } = await load()
    const listener = vi.fn()
    onMainLanguageChanged(listener)()
    setMainLanguage('en')
    expect(listener).not.toHaveBeenCalled()
  })

  it('镜像写不进去时只记日志，语言照常切换', async () => {
    const { t, setMainLanguage } = await load()
    // 数据目录被删掉，写入必然失败
    rmSync(mocks.userData, { recursive: true, force: true })
    setMainLanguage('en')
    expect(quit(t)).toBe('Quit Marchen')
    expect(mocks.writeLog).toHaveBeenCalledWith(
      expect.objectContaining({ lv: 'warn', msg: 'language_mirror_write_failed' }),
    )
  })
})

describe('重置应用', () => {
  it('删除镜像并回到按系统语言解析', async () => {
    const { t, setMainLanguage, resetMainLanguage, onMainLanguageChanged } = await load()
    setMainLanguage('en')
    const listener = vi.fn()
    onMainLanguageChanged(listener)
    resetMainLanguage()
    expect(readMirror()).toBeNull()
    expect(quit(t)).toBe('退出 Marchen')
    expect(listener).toHaveBeenCalledOnce()
  })
})

// 界面多语言放开（LANGUAGE_SWITCH_RELEASED 改为 true）之后，正式构建不再固定语言，这一组届时删除
describe.skipIf(LANGUAGE_SWITCH_RELEASED)('发布开关未放开的正式构建', () => {
  beforeEach(() => {
    mocks.env.isDev = false
  })

  it('固定为简体中文，忽略系统语言与镜像', async () => {
    mocks.systemLanguages = ['en-US']
    writeFileSync(mirror(), '{"language":"en"}')
    expect(quit((await load()).t)).toBe('退出 Marchen')
  })

  it('忽略页面上报的语言，也不改写镜像', async () => {
    const { t, setMainLanguage } = await load()
    setMainLanguage('en')
    expect(quit(t)).toBe('退出 Marchen')
    expect(readMirror()).toBeNull()
  })

  it('重置后仍是简体中文', async () => {
    mocks.systemLanguages = ['en-US']
    const { t, resetMainLanguage } = await load()
    resetMainLanguage()
    expect(quit(t)).toBe('退出 Marchen')
  })
})
