/**
 * 弹幕翻译的功能状态。服务层只产出状态码与数值，
 * 面向用户的文案统一由 messages.ts 根据状态生成，不在这里拼接文字。
 */
import type { TranslationAssetErrorCode } from './assets/download'
import type { TranslatorErrorCode } from './engine/client'
import type { TranslationUnsupportedReason } from './support'
import { jotaiStore } from '@renderer/atoms/store'
import { atom, useAtomValue } from 'jotai'

export type DanmakuTranslationStatus =
  | { state: 'unsupported'; reason: TranslationUnsupportedReason }
  | { state: 'off' }
  /** 首次开启、本机没有资源：等待用户确认下载 */
  | { state: 'confirming' }
  /** loaded / total 为解压后的字节数 */
  | { state: 'downloading'; loaded: number; total: number }
  | { state: 'download_failed'; code: TranslationAssetErrorCode }
  /** 已开启且资源就绪，但当前没有需要翻译的弹幕（不在播放页或本集无中文弹幕） */
  | { state: 'ready' }
  /** 正在加载引擎与模型 */
  | { state: 'starting' }
  /** done / total 为弹幕条数 */
  | { state: 'translating'; done: number; total: number }
  | { state: 'done'; total: number }
  | { state: 'engine_failed'; code: TranslatorErrorCode | 'assets_storage' }

export const danmakuTranslationStatusAtom = atom<DanmakuTranslationStatus>({ state: 'off' })

export const getDanmakuTranslationStatus = () => jotaiStore.get(danmakuTranslationStatusAtom)

export const setDanmakuTranslationStatus = (status: DanmakuTranslationStatus) =>
  jotaiStore.set(danmakuTranslationStatusAtom, status)

export const useDanmakuTranslationStatus = () => useAtomValue(danmakuTranslationStatusAtom)
