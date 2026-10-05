import { jotaiStore } from '@renderer/atoms/store'
import { isWeb } from '@renderer/lib/utils'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { atom } from 'jotai'

/**
 * 弹窗开关放在全局 atom：弹窗在应用根部只挂载一次，
 * 入口（播放器空态的按钮）只负责调用打开函数，不持有弹窗状态。
 */
export const playbackHistoryDialogAtom = atom(false)

export const openPlaybackHistoryDialog = () => {
  // 播放记录仅桌面端提供；Web 即使误调用也不打开
  if (isWeb) return
  captureFeatureUsed('playback_history', 'open')
  jotaiStore.set(playbackHistoryDialogAtom, true)
}

export const closePlaybackHistoryDialog = () => {
  jotaiStore.set(playbackHistoryDialogAtom, false)
}
