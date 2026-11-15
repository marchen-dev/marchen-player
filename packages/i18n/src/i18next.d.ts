/**
 * 让 i18next 的 t() 认识本项目的文案：键来自简体中文（源语言）。
 * 引用不存在的键、漏传插值变量都会在类型检查时报错。
 */
import type zhCN from './locales/zh-CN'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: typeof zhCN
  }
}
