/**
 * 主进程的界面多语言入口：应用菜单等由主进程显示的文字从这里取。
 *
 * 语言由页面上报（见 renderer 的 initialize/i18n.ts）；页面加载之前用上次保存的镜像，
 * 没有镜像时按系统首选语言解析。主进程只注册自己用到的命名空间。
 */
import type { AppLanguage, Translate } from '@marchen/i18n'
import type { i18n as I18n } from 'i18next'
import type { LanguageStore } from './language-store'
import { join } from 'node:path'
import {
  createI18n,
  isAppLanguage,
  isLanguageSwitchEnabled,
  resolveLanguage,
  SOURCE_LANGUAGE,
  SYSTEM_PREFERENCE,
  toLanguageTag,
} from '@marchen/i18n'
import { app } from 'electron'
import { writeLog } from './diagnostic-log'
import { isDev } from './env'
import { createLanguageStore } from './language-store'

/** 未放开时主进程与页面一样固定为简体中文，忽略镜像与页面上报的语言 */
const SWITCH_ENABLED = isLanguageSwitchEnabled(isDev)

let store: LanguageStore | undefined
const getStore = () =>
  (store ??= createLanguageStore(join(app.getPath('userData'), 'language.json')))

/**
 * 系统首选语言列表。macOS 上在应用就绪之前就能取到（实测），应用菜单也只在 macOS 建立；
 * 其他平台就绪前的行为未验证，取不到时按空列表处理（解析为英文），页面上报后会修正。
 */
export const getSystemLanguages = (): string[] => {
  try {
    return app.getPreferredSystemLanguages()
  } catch {
    return []
  }
}

const systemLanguage = (): AppLanguage =>
  toLanguageTag(
    resolveLanguage(SYSTEM_PREFERENCE, getSystemLanguages(), { switchEnabled: SWITCH_ENABLED }),
  )

let instance: I18n | undefined
const getInstance = () =>
  (instance ??= createI18n({
    language: SWITCH_ENABLED ? (getStore().read() ?? systemLanguage()) : SOURCE_LANGUAGE,
    namespaces: ['main', 'common'],
  }))

/** 取文案；实例在首次使用时才创建，每次调用按当时的语言求值 */
export const t = ((...args: unknown[]) =>
  (getInstance().t as unknown as (...values: unknown[]) => unknown)(
    ...args,
  )) as unknown as Translate

/** 语言变化时调用，返回取消订阅的函数；应用菜单据此重建 */
export const onMainLanguageChanged = (listener: () => void): (() => void) => {
  const i18n = getInstance()
  i18n.on('languageChanged', listener)
  return () => i18n.off('languageChanged', listener)
}

const changeLanguage = (language: AppLanguage) => {
  const i18n = getInstance()
  // 文案是静态资源，切换在这次调用内完成
  if (i18n.language !== language) void i18n.changeLanguage(language)
}

/**
 * 页面上报当前界面语言。输入来自 renderer，只接受已知语言；
 * 未放开时不改变主进程语言。
 */
export const setMainLanguage = (language: unknown): void => {
  if (!SWITCH_ENABLED || !isAppLanguage(language)) return
  changeLanguage(language)
  if (getStore().read() === language) return
  if (!getStore().write(language)) {
    // 只影响下次冷启动时菜单的语言，不影响这次切换
    writeLog({ lv: 'warn', cat: 'app', msg: 'language_mirror_write_failed', data: { language } })
  }
}

/** 重置应用：删除镜像，回到按系统语言解析；页面重新加载后会再上报一次 */
export const resetMainLanguage = (): void => {
  getStore().clear()
  changeLanguage(SWITCH_ENABLED ? systemLanguage() : SOURCE_LANGUAGE)
}
