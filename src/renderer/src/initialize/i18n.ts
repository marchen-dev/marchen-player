/**
 * 启动时确定界面语言，并在语言偏好变化时重新应用。
 *
 * 语言偏好保存在应用设置里，renderer 是唯一来源；主进程只保存一份镜像，
 * 用于页面加载之前的应用菜单。语言的应用挂在对设置的订阅上，而不是只写在切换按钮里：
 * 重置应用、Web 另一个标签页改了设置，都走同一条路径。
 */
import type { LanguagePreference, RuntimeLanguage } from '@marchen/i18n'
import { resolveLanguage, toLanguageTag } from '@marchen/i18n'
import { appSettingAtom } from '@renderer/atoms/settings/app'
import { jotaiStore } from '@renderer/atoms/store'
import { ipcClient } from '@renderer/lib/client'
import { i18n, LANGUAGE_SWITCH_ENABLED, PSEUDO_ENABLED } from '@renderer/lib/i18n'
import dayjs from 'dayjs'

/** dayjs 的语言包名与界面语言的对应 */
const DAYJS_LOCALES: Record<string, string> = { 'zh-CN': 'zh-cn', en: 'en' }

/**
 * 系统首选语言列表。Electron 向主进程取：Chromium 给页面的 navigator.languages 是由应用
 * 语言环境推出来的，和主进程看到的系统列表可能不同，两边各用各的会得出不同的语言。
 * 取不到（或是 Web）时用 navigator.languages。
 */
const readSystemLanguages = async (): Promise<readonly string[]> => {
  try {
    const languages = await ipcClient?.setting.getSystemLanguages()
    if (languages?.length) return languages
  } catch (error) {
    console.warn('[i18n] 读取系统语言失败，改用浏览器提供的语言列表', error)
  }
  return navigator.languages?.length ? navigator.languages : [navigator.language]
}

const applyLanguage = (language: RuntimeLanguage) => {
  // 文案是静态资源，切换在这次调用内完成，不需要等待
  if (i18n.language !== language) void i18n.changeLanguage(language)
  const tag = toLanguageTag(language)
  // 文档语言标记影响浏览器对汉字字形、断行与读屏语言的选择
  document.documentElement.lang = tag
  dayjs.locale(DAYJS_LOCALES[tag])
  // 主进程据此更新应用菜单并保存镜像；失败不影响页面自身的语言
  void ipcClient?.setting.setLanguage(tag).catch((error: unknown) => {
    console.warn('[i18n] 通知主进程切换语言失败', error)
  })
}

export async function initializeI18n(): Promise<void> {
  // 未放开时界面固定为简体中文：不读取系统语言，也不通知主进程（主进程同样固定）
  if (!LANGUAGE_SWITCH_ENABLED) return

  const systemLanguages = await readSystemLanguages()
  const resolve = (preference: LanguagePreference) =>
    resolveLanguage(preference, systemLanguages, {
      switchEnabled: LANGUAGE_SWITCH_ENABLED,
      pseudoEnabled: PSEUDO_ENABLED,
    })

  let preference = jotaiStore.get(appSettingAtom).language
  applyLanguage(resolve(preference))

  jotaiStore.sub(appSettingAtom, () => {
    const next = jotaiStore.get(appSettingAtom).language
    if (next === preference) return
    preference = next
    applyLanguage(resolve(next))
  })
}
