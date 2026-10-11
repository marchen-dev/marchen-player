import type { PlayerEngineState } from '@renderer/atoms/player-engine'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { reportOperationalError } from '@renderer/services/telemetry/operational-errors'
import { useCallback, useEffect, useState } from 'react'

/**
 * 画中画不可用的原因：
 * - unsupported：浏览器未提供画中画能力（如 Firefox）
 * - compat：兼容内核画面是 MediaStream、声音走 Web Audio，画中画窗口里的暂停无法同步到声音
 * - switching：内核切换中，画面元素即将变化
 */
export type PictureInPictureUnavailableReason = 'unsupported' | 'compat' | 'switching'

export interface PictureInPictureControl {
  active: boolean
  unavailableReason?: PictureInPictureUnavailableReason
  /** 必须在用户点击中同步调用，浏览器要求进入画中画由用户手势触发 */
  toggle: () => void
}

const resolveUnavailableReason = (
  video: HTMLVideoElement | null,
  engine: PlayerEngineState | null,
): PictureInPictureUnavailableReason | undefined => {
  if (!document.pictureInPictureEnabled || !video || video.disablePictureInPicture)
    return 'unsupported'
  if (engine?.switching) return 'switching'
  if (engine?.actual !== 'native') return 'compat'
  return undefined
}

const exitIfOwnedBy = (video: HTMLVideoElement) => {
  if (document.pictureInPictureElement !== video) return
  void document
    .exitPictureInPicture()
    .catch((error) => reportOperationalError('player', 'picture_in_picture.exit', error, true))
}

/**
 * 原生 H5 内核的画中画，只投放画面，不含弹幕与字幕。
 * 播放 / 暂停 / 进度由原生 video 元素事件同步回播放会话，无需额外桥接。
 */
export const usePictureInPicture = (
  video: HTMLVideoElement | null,
  engine: PlayerEngineState | null,
  sessionReady: boolean,
): PictureInPictureControl => {
  const [active, setActive] = useState(false)
  const unavailableReason = resolveUnavailableReason(video, engine)
  const available = sessionReady && !unavailableReason

  useEffect(() => {
    if (!video) return
    const sync = () => setActive(document.pictureInPictureElement === video)
    sync()
    video.addEventListener('enterpictureinpicture', sync)
    video.addEventListener('leavepictureinpicture', sync)
    return () => {
      video.removeEventListener('enterpictureinpicture', sync)
      video.removeEventListener('leavepictureinpicture', sync)
      // 播放器卸载或 video 元素被替换时，旧元素不能继续留在画中画窗口
      exitIfOwnedBy(video)
    }
  }, [video])

  useEffect(() => {
    // 切到兼容内核或会话结束后，原生画面已停止更新，主动关掉画中画窗口
    if (video && !available) exitIfOwnedBy(video)
  }, [available, video])

  const toggle = useCallback(() => {
    if (!video) return
    if (document.pictureInPictureElement === video) {
      captureFeatureUsed('picture_in_picture', 'exit')
      exitIfOwnedBy(video)
      return
    }
    if (!available) return
    captureFeatureUsed('picture_in_picture', 'enter')
    void video
      .requestPictureInPicture()
      .catch((error) => reportOperationalError('player', 'picture_in_picture.enter', error))
  }, [available, video])

  return { active, unavailableReason, toggle }
}
