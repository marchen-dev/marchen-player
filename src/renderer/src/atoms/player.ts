/**
 * 播放器相关的 jotai atom
 *
 * 只保留简单 UI 状态（设置面板开关）。
 * 加载流程的状态已迁移到 PlayerLoadingService。
 */

import type { DurableMediaSource } from '@marchen/shared/media'
import type { PlayerSettingsPanelState, PlayerSettingsSection } from './player-settings-state'

import { atomWithReset, useResetAtom } from 'jotai/utils'
import {
  closePlayerSettingsPanel,
  initialPlayerSettingsPanelState,
  openPlayerSettingsPanel,
} from './player-settings-state'
import { jotaiStore } from './store'

// 设置面板的可见性和当前标签必须原子化更新，避免先打开旧标签再跳转的闪烁。
export const playerSettingsPanelAtom = atomWithReset<PlayerSettingsPanelState>(
  initialPlayerSettingsPanelState,
)

export const showPlayerSettingsPanel = (section: PlayerSettingsSection = 'playback') => {
  jotaiStore.set(playerSettingsPanelAtom, (state) => openPlayerSettingsPanel(state, section))
}

export const hidePlayerSettingsPanel = () => {
  jotaiStore.set(playerSettingsPanelAtom, closePlayerSettingsPanel)
}

// videoAtom 保留：被 Event.tsx（进度保存）和 DanmakuSource（hash 读取）使用
export const videoAtom = atomWithReset<{
  source: DurableMediaSource | null
  hash: string
  size: number
  name: string
  playList: { path: string; fileHash?: string; name: string }[]
}>({
  source: null,
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
  const resetPlayerSettingsPanel = useResetAtom(playerSettingsPanelAtom)

  return () => {
    resetVideo()
    resetPlayerSettingsPanel()
  }
}

// 以下已迁移到 PlayerLoadingService，保留类型导出供过渡期使用
export interface MatchedVideoType {
  episodeId: number
  animeTitle: string
  episodeTitle: string
  animeId: number
}
