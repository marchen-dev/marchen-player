/**
 * renderer 的界面多语言入口。
 *
 * - 组件里用 react-i18next 的 `useTranslation('命名空间')`；
 * - 组件之外（全局提示、服务）从这里引入 `t`，在调用时求值；
 * - 模块顶层的常量只存键，不存文字：它们在 import 时求值，存了文字就不会随语言切换更新。
 *
 * 实例在模块加载时以简体中文同步初始化（文案是随代码打包的静态对象，这里不读取系统语言），
 * 所以任何代码在任何时刻调用 `t` 都有结果，测试里直接 import 得到的也固定是简体中文。
 * 实际语言由 initialize/i18n.ts 在挂载前切换。
 */
import type { MessageNamespace, RuntimeLanguage, Translate } from '@marchen/i18n'
import type { ParseKeys } from 'i18next'
import {
  createI18n,
  formatNumber as formatNumberFor,
  isLanguageSwitchEnabled,
  isRuntimeLanguage,
  registerPseudoLanguage,
  SOURCE_LANGUAGE,
} from '@marchen/i18n'
import { initReactI18next, useTranslation } from 'react-i18next'

/** 当前构建是否允许切换界面语言；为假时界面固定为简体中文，设置里不显示语言选项 */
export const LANGUAGE_SWITCH_ENABLED = isLanguageSwitchEnabled(import.meta.env.DEV)

/** 伪本地化只在开发态存在，见 packages/i18n/src/pseudo.ts */
export const PSEUDO_ENABLED = import.meta.env.DEV

export const i18n = createI18n({
  language: SOURCE_LANGUAGE,
  plugins: [initReactI18next],
})
// 直接写 import.meta.env.DEV 而不是上面的常量：打包器据此在正式构建里去掉伪本地化的代码
if (import.meta.env.DEV) registerPseudoLanguage(i18n)

/** 组件之外取文案；每次调用都按当时的语言求值。默认命名空间之外的键写成 `命名空间:键` */
export const t: Translate = i18n.t

/**
 * 某个命名空间下的文案键。模块顶层的常量用它声明「存的是键」，
 * 写错键在类型检查时就能发现，渲染时再交给 t 翻译。
 */
export type MessageKey<Namespace extends MessageNamespace> = ParseKeys<Namespace>

export const getLanguage = (): RuntimeLanguage =>
  isRuntimeLanguage(i18n.language) ? i18n.language : SOURCE_LANGUAGE

/**
 * 订阅当前语言。组件里调用了「组件外返回文案的函数」（如 formatNumber）而自己没有用
 * useTranslation 时，用它保证语言切换后重新渲染。
 */
export const useLanguage = (): RuntimeLanguage => {
  useTranslation()
  return getLanguage()
}

/** 按当前界面语言格式化数量（带千分位分隔） */
export const formatNumber = (value: number): string => formatNumberFor(value, getLanguage())
