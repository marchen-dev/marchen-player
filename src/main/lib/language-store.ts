/**
 * 界面语言的本机镜像（`<userData>/language.json`）。
 *
 * 语言偏好的唯一来源在 renderer 的应用设置里，主进程拿不到；这里保存的是上次运行时
 * 页面上报的「实际语言」，只有一个用途：下次冷启动时，在页面加载之前就用正确的语言建应用菜单。
 * 页面每次启动都会重新上报，所以这份镜像与设置不一致时会自己修正。
 */
import type { AppLanguage } from '@marchen/i18n'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { isAppLanguage } from '@marchen/i18n'

export interface LanguageStore {
  /** 没有文件、内容损坏或语言已不受支持时返回 null */
  read: () => AppLanguage | null
  /** 写入失败（磁盘只读等）只影响下次冷启动的菜单语言，由调用方记日志，不抛出 */
  write: (language: AppLanguage) => boolean
  clear: () => void
}

/** 同步读写：文件只有几十字节，启动时建菜单之前就要用到 */
export const createLanguageStore = (file: string): LanguageStore => ({
  read() {
    try {
      const value: unknown = JSON.parse(readFileSync(file, 'utf8'))
      const language =
        value && typeof value === 'object' ? (value as { language?: unknown }).language : null
      return isAppLanguage(language) ? language : null
    } catch {
      return null
    }
  },
  write(language) {
    try {
      writeFileSync(file, JSON.stringify({ language }), 'utf8')
      return true
    } catch {
      return false
    }
  },
  clear() {
    rmSync(file, { force: true })
  },
})
