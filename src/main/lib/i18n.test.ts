import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

describe('主进程显示的对话框与失败说明', () => {
  /** 主进程命名空间里的全部文案键，逐个在两种语言下取值 */
  const mainKeys = async () => {
    const { default: main } = await import('../../../packages/i18n/src/locales/zh-CN/main')
    const walk = (value: unknown, prefix: string): string[] =>
      typeof value === 'string'
        ? [prefix]
        : Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
            walk(child, prefix ? `${prefix}.${key}` : key),
          )
    return walk(main, '')
  }

  it('对话框按当前语言取文案，切换后立即生效', async () => {
    const { t, setMainLanguage } = await load()
    expect(t('main:dialog.quit')).toBe('退出')
    expect(t('main:fileDialog.video')).toBe('视频文件')
    setMainLanguage('en')
    expect(t('main:dialog.quit')).toBe('Quit')
    expect(t('main:fileDialog.video')).not.toMatch(/\p{Script=Han}/u)
    expect(t('main:update.later')).not.toMatch(/\p{Script=Han}/u)
  })

  it('英文下主进程的文案没有残留汉字', async () => {
    const { t, setMainLanguage } = await load()
    setMainLanguage('en')
    const translate = t as unknown as (key: string, options?: object) => string
    const leftovers = (await mainKeys()).filter((key) =>
      /\p{Script=Han}/u.test(translate(`main:${key}`, { appName: 'Marchen', id: '1' })),
    )
    expect(leftovers).toEqual([])
  })

  it('简体中文显示错误原来的说明', async () => {
    const { describeMainError } = await load()
    const { UserError } = await import('@marchen/shared/errors')
    expect(
      describeMainError(new UserError('update.save_timeout', '保存播放进度超时，请重试')),
    ).toBe('保存播放进度超时，请重试')
    expect(describeMainError(new Error('net::ERR_FAILED'))).toBe('net::ERR_FAILED')
  })

  it('其他语言下带错误码的失败按错误码取文案，其余原样显示', async () => {
    const { describeMainError, setMainLanguage } = await load()
    const { UserError } = await import('@marchen/shared/errors')
    setMainLanguage('en')
    const described = describeMainError(
      new UserError('update.save_timeout', '保存播放进度超时，请重试'),
    )
    expect(described).not.toMatch(/\p{Script=Han}/u)
    expect(described.length).toBeGreaterThan(0)
    // 没有对应文案的错误码、普通错误（多为系统给出的英文）保持原样
    expect(describeMainError(new UserError('unknown.code', '原说明'))).toBe('原说明')
    expect(describeMainError(new Error('net::ERR_FAILED'))).toBe('net::ERR_FAILED')
    expect(describeMainError('字符串')).toBe('字符串')
  })
})
