/**
 * 供 React 组件按原文查译文的 Hook。
 *
 * 译文在后台一批批产生（每秒十几批），组件没有必要跟着每一批重渲染：
 * 这里按固定间隔采样译文表的版本号，版本变化时才返回一个新的查询函数，
 * 依赖它的派生数据（例如按译文搜索的结果）随之刷新。
 */
import type { TranslationStore } from './translation-store'
import { useMemo, useSyncExternalStore } from 'react'
import { lookupTranslation } from './display-text'
import { translationStore } from './translation-store'

const SAMPLE_INTERVAL = 500

let sampledVersion = translationStore.version

const subscribe = (onChange: () => void) => {
  const sample = () => {
    if (sampledVersion === translationStore.version) return
    sampledVersion = translationStore.version
    onChange()
  }
  // 订阅建立时先对齐一次，避免沿用很久以前的采样值
  sampledVersion = translationStore.version
  const timer = setInterval(sample, SAMPLE_INTERVAL)
  return () => clearInterval(timer)
}

const getSnapshot = () => sampledVersion

/** version 只用于让每个版本对应一个新的函数实例，查询始终读译文表的最新内容 */
const createLookup = (store: TranslationStore, _version: number) => (text: string) =>
  lookupTranslation(store, text)

/** 未开启弹幕翻译时返回 undefined */
export const useTranslationLookup = (
  enabled: boolean,
): ((text: string) => string | undefined) | undefined => {
  const version = useSyncExternalStore(subscribe, getSnapshot)
  return useMemo(
    () => (enabled ? createLookup(translationStore, version) : undefined),
    [enabled, version],
  )
}
