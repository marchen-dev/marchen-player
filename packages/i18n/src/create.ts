import type { i18n, InitOptions, Module, NewableModule, Resource } from 'i18next'
import type { RuntimeLanguage } from './languages'
import { createInstance } from 'i18next'
import { PSEUDO_LANGUAGE, SOURCE_LANGUAGE } from './languages'
import en from './locales/en'
import zhCN from './locales/zh-CN'
import { createPseudoResources } from './pseudo'

/** 文案的命名空间，按界面区域划分；以源语言为准 */
export type MessageNamespace = keyof typeof zhCN
export const MESSAGE_NAMESPACES = Object.keys(zhCN) as MessageNamespace[]
export const DEFAULT_NAMESPACE = 'common' satisfies MessageNamespace

/**
 * 取文案的函数类型：默认命名空间的键可以直接写，其他命名空间用 `命名空间:键`。
 * 注意不是 i18next 导出的 `TFunction`——后者默认只认默认命名空间的键。
 */
export type Translate = i18n['t']

/** 全部语言的文案；类型放宽成普通字典，英文因单复数会比中文多出键 */
export const MESSAGE_RESOURCES = { 'zh-CN': zhCN, en } satisfies Resource

export interface CreateI18nOptions {
  /** 初始语言 */
  language: RuntimeLanguage
  /** 只注册这些命名空间；主进程只需要其中一小部分。默认全部 */
  namespaces?: readonly MessageNamespace[]
  /** i18next 插件，例如 renderer 的 initReactI18next */
  plugins?: ReadonlyArray<Module | NewableModule<Module>>
}

const pickNamespaces = (
  messages: Record<string, unknown>,
  namespaces: readonly MessageNamespace[],
) => Object.fromEntries(namespaces.map((namespace) => [namespace, messages[namespace]]))

/** 由初始化参数得出 i18next 的配置；单独导出是为了测试 */
export function buildInitOptions(options: CreateI18nOptions): InitOptions {
  const namespaces = options.namespaces ?? MESSAGE_NAMESPACES
  const resources: Resource = {
    'zh-CN': pickNamespaces(zhCN, namespaces) as Resource[string],
    en: pickNamespaces(en, namespaces) as Resource[string],
  }
  return {
    lng: options.language,
    // 当前语言缺某条文案时显示简体中文，而不是键名
    fallbackLng: SOURCE_LANGUAGE,
    // 语言代码原样使用，不拆成「en-US → en」这样的链
    load: 'currentOnly',
    ns: [...namespaces],
    defaultNS: DEFAULT_NAMESPACE,
    resources,
    // 文案是随代码打包的静态对象，同步初始化：init 返回后立刻可以调用 t
    initAsync: false,
    // React 自己会转义文本，再转义一次会把 & 之类显示成实体
    interpolation: { escapeValue: false },
    // 资源同步可用，不需要 Suspense
    react: { useSuspense: false },
  }
}

/**
 * 创建一个 i18next 实例。main 与 renderer 各自调用一次，配置由这里统一，
 * 保证两边对回退、插值、单复数的处理一致。
 */
export function createI18n(options: CreateI18nOptions): i18n {
  const instance = createInstance()
  for (const plugin of options.plugins ?? []) instance.use(plugin)
  void instance.init(buildInitOptions(options))
  return instance
}

/**
 * 给实例注册伪本地化语言（见 pseudo.ts），仅开发态调用。
 *
 * 从英文生成：它要回答的是「换成更长的拉丁文字后哪里会溢出」。
 * 单独成函数而不是 createI18n 的一个选项，是为了让调用方把它放在「是否开发态」的判断里，
 * 正式构建打包时能把伪本地化的代码整个去掉。
 */
export function registerPseudoLanguage(instance: i18n): void {
  for (const namespace of instance.options.ns as readonly string[]) {
    const source = (en as Record<string, unknown>)[namespace]
    if (source) {
      instance.addResourceBundle(
        PSEUDO_LANGUAGE,
        namespace,
        createPseudoResources(source),
        true,
        true,
      )
    }
  }
}
