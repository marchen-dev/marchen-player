import type { RuntimeLanguage } from '@marchen/i18n'
import type { SubtitleTrackDescriptor } from '../platform/ports'
import type { SubtitleTrackOption } from './context'

export const allocateExternalHistoryId = (
  tags: ReadonlyArray<{ id: number }>,
  used: ReadonlySet<number>,
) => {
  let id = Math.min(-1, ...tags.map((tag) => tag.id)) - 1
  while (used.has(id)) id -= 1
  return id
}

/**
 * 目录轨道在 HISTORY 中的 id：
 * - 内嵌轨道用轨道号；
 * - 带稳定标识的外挂轨道（媒体源字幕）沿用历史中 path 相同的 tag，续播时能恢复选择；
 * - 其余外挂轨道分配新的负数 id。
 */
export const resolveTrackHistoryId = (
  track: SubtitleTrackDescriptor,
  tags: ReadonlyArray<{ id: number; origin?: string; path?: string }>,
  used: ReadonlySet<number>,
) => {
  if (track.origin === 'embedded') {
    const embeddedId = track.embedded?.number ?? Number(track.id.replace('embedded:', ''))
    if (Number.isInteger(embeddedId)) return embeddedId
  }
  const persisted = track.persistenceKey
    ? tags.find((tag) => tag.origin === 'external' && tag.path === track.persistenceKey)
    : undefined
  if (persisted && !used.has(persisted.id)) return persisted.id
  return allocateExternalHistoryId(tags, used)
}

export const isChineseLanguage = (language?: string) =>
  Boolean(language && /^(?:zh|zho|chi|chs|cht)(?:-|$)/i.test(language))

export const isEnglishLanguage = (language?: string) =>
  Boolean(language && /^(?:en|eng)(?:-|$)/i.test(language))

/** 字幕轨道的语言是否与界面语言一致；伪本地化的文字是拉丁字母，按英文处理 */
const matchesUiLanguage = (uiLanguage: RuntimeLanguage, language?: string) =>
  uiLanguage === 'zh-CN' ? isChineseLanguage(language) : isEnglishLanguage(language)

/**
 * 默认字幕轨道：历史选择 → 与界面语言一致的轨道 → 中文轨 → 第一条。
 * 界面语言是简体中文时，第二步与第三步相同，结果与只按中文轨优先时一致。
 */
export const selectPreferredSubtitleTrack = (
  tracks: ReadonlyArray<SubtitleTrackOption>,
  defaultId?: number,
  uiLanguage: RuntimeLanguage = 'zh-CN',
) =>
  tracks.find((track) => track.historyId === defaultId) ??
  tracks.find((track) => matchesUiLanguage(uiLanguage, track.language)) ??
  tracks.find((track) => isChineseLanguage(track.language)) ??
  tracks[0]
