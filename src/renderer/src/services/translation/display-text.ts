/**
 * 译文查询：渲染器与弹幕列表共用，保证两处对同一条弹幕给出相同的译文。
 */
import type { TranslationStore } from './translation-store'
import { translationKey } from './schedule'

type TranslationLookup = Pick<TranslationStore, 'get'>

/** 某段弹幕文本的译文；尚未翻译、不需要翻译或翻译失败时为 undefined */
export const lookupTranslation = (store: TranslationLookup, text: string): string | undefined =>
  store.get(translationKey(text))

/**
 * 生成「显示文本」解析函数：有译文显示译文，否则显示条目自身的文本。
 * 每条弹幕出场时调用一次，译文陆续到达后新出场的弹幕自然读到最新结果。
 */
export const createDisplayTextResolver =
  (store: TranslationLookup) =>
  (item: { text: string }): string =>
    lookupTranslation(store, item.text) ?? item.text
