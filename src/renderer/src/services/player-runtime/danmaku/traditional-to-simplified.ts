/**
 * 弹幕繁体 → 简体字形转换。
 *
 * 只加载 OpenCC 的 TSPhrases + TSCharacters 两张字典（约 37 KB）：繁 → 简是多对一，
 * 词组表仅用于少量需要整词处理的情况，不做「軟體 → 软件」之类的地区用语转换。
 * 转换发生在渲染前，缓存和 HISTORY 始终保留原文，切换开关无需重新请求弹幕。
 */
import type { DanmakuItem } from '@marchen/danmaku-engine'
import type { ConverterFunction } from 'opencc-js/core'
import { ConverterFactory } from 'opencc-js/core'
import TSCharacters from 'opencc-js/dict/TSCharacters'
import TSPhrases from 'opencc-js/dict/TSPhrases'

let converter: ConverterFunction | null = null
// 弹幕大量重复（「草」「233」等），按原文缓存结果，避免重复走字典树
const cache = new Map<string, string>()
const MAX_CACHE_SIZE = 20_000

/** 首次调用时才构建字典树，未开启转换的用户不承担初始化开销 */
function getConverter(): ConverterFunction {
  converter ??= ConverterFactory([[TSPhrases, TSCharacters]])
  return converter
}

export function toSimplified(text: string): string {
  const cached = cache.get(text)
  if (cached !== undefined) return cached
  const result = getConverter()(text)
  // 超出上限直接清空：弹幕按集切换，旧条目复用价值低，无需 LRU
  if (cache.size >= MAX_CACHE_SIZE) cache.clear()
  cache.set(text, result)
  return result
}

/** 转换弹幕文本；文本未变化的条目原样复用，减少对象分配 */
export function convertDanmakuItemsToSimplified(items: DanmakuItem[]): DanmakuItem[] {
  return items.map((item) => {
    const text = toSimplified(item.text)
    return text === item.text ? item : { ...item, text }
  })
}
