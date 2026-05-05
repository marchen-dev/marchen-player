/**
 * 播放器相关的 jotai atom
 *
 * 只保留简单 UI 状态（设置面板开关）。
 * 加载流程的状态已迁移到 PlayerLoadingService。
 */

import { atomWithReset, useResetAtom } from 'jotai/utils'

import { jotaiStore } from './store'

// 设置面板开关状态
export const playerSettingSheetAtom = atomWithReset(false)

export const showPlayerSettingSheet = () => jotaiStore.set(playerSettingSheetAtom, true)

// videoAtom 保留：被 Event.tsx（进度保存）和 DanmakuSource（hash 读取）使用
export const videoAtom = atomWithReset<{
  url: string
  hash: string
  size: number
  name: string
  playList: { urlWithPrefix: string; name: string }[]
}>({
  url: '',
  hash: '',
  size: 0,
  name: '',
  playList: [],
})

/**
 * 重置播放状态（关闭播放器时调用）
 */
export const useClearPlayingVideo = () => {
  const resetVideo = useResetAtom(videoAtom)
  const resetPlayerSettingSheet = useResetAtom(playerSettingSheetAtom)

  return () => {
    resetVideo()
    resetPlayerSettingSheet()
  }
}

// 以下已迁移到 PlayerLoadingService，保留类型导出供过渡期使用
export interface MatchedVideoType {
  episodeId: number
  animeTitle: string
  episodeTitle: string
  animeId: number
}
