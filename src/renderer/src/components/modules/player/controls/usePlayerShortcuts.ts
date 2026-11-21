import type { RefObject } from 'react'
import { useEffect, useEffectEvent } from 'react'

const RIGHT_HOLD_DELAY_MS = 300

interface PlayerShortcutActions {
  togglePlayback: () => void
  seekBy: (offset: number) => void
  startRightHold: () => (() => void) | undefined
  changeVolume: (offset: number) => void
  toggleMuted: () => void
  toggleDanmaku?: () => void
  toggleFullscreen?: () => void
  exitFullscreen?: () => void
}

interface PlayerShortcutOptions {
  rootRef: RefObject<HTMLElement | null>
  blocked: boolean
  sourceId: string | undefined
  actions: PlayerShortcutActions
}

/** 全局快捷键只在当前播放器内生效，并避开可编辑控件和打开的面板。 */
export const usePlayerShortcuts = ({
  rootRef,
  blocked,
  sourceId,
  actions,
}: PlayerShortcutOptions) => {
  const getActions = useEffectEvent(() => actions)
  useEffect(() => {
    if (blocked || !sourceId) return
    return bindPlayerShortcuts(rootRef, () => getActions())
  }, [blocked, rootRef, sourceId])
}

export function bindPlayerShortcuts(
  rootRef: PlayerShortcutOptions['rootRef'],
  getActions: () => PlayerShortcutActions,
) {
  // 按键期间播放状态和回调可能更新。手势独立于回调更新，并在换片或卸载时清理。
  let rightPress: { timer: number; held: boolean; restore?: () => void } | undefined

  const finishRightPress = (seekOnTap = false) => {
    if (!rightPress) return
    const { timer, held, restore } = rightPress
    rightPress = undefined
    window.clearTimeout(timer)
    if (held) restore?.()
    else if (seekOnTap && rootRef.current?.isConnected) getActions().seekBy(5)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || !rootRef.current?.isConnected || isEditableTarget(event.target))
      return

    const key = event.key.toLowerCase()
    if (key === 'arrowright') {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
        return
      event.preventDefault()
      if (event.repeat || rightPress) return
      rightPress = {
        held: false,
        timer: window.setTimeout(() => {
          if (!rightPress || !rootRef.current?.isConnected) return
          rightPress.held = true
          rightPress.restore = getActions().startRightHold()
        }, RIGHT_HOLD_DELAY_MS),
      }
      return
    }
    if (event.repeat) return

    const actions = getActions()
    if (event.code === 'Space' || key === 'k') actions.togglePlayback()
    else if (key === 'arrowleft') actions.seekBy(-5)
    else if (key === 'arrowup') actions.changeVolume(0.05)
    else if (key === 'arrowdown') actions.changeVolume(-0.05)
    else if (key === 'm') actions.toggleMuted()
    else if (
      key === 'd' &&
      actions.toggleDanmaku &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.isComposing
    )
      actions.toggleDanmaku()
    else if (key === 'f' && actions.toggleFullscreen) actions.toggleFullscreen()
    else if (key === 'escape' && actions.exitFullscreen) actions.exitFullscreen()
    else return
    event.preventDefault()
  }

  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== 'arrowright' || !rightPress) return
    finishRightPress(true)
  }
  const cancelRightPress = () => finishRightPress()
  const handleVisibilityChange = () => {
    if (document.hidden) cancelRightPress()
  }

  window.addEventListener('keydown', handleKeyDown)
  // 即使松手时焦点已经落在其他控件，也要恢复倍速。
  window.addEventListener('keyup', handleKeyUp, true)
  window.addEventListener('blur', cancelRightPress)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  return () => {
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp, true)
    window.removeEventListener('blur', cancelRightPress)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    cancelRightPress()
  }
}

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}
