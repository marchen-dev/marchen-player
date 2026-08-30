import type { RefObject } from 'react'
import { useEffect } from 'react'

interface PlayerShortcutActions {
  togglePlayback: () => void
  seekBy: (offset: number) => void
  changeVolume: (offset: number) => void
  toggleMuted: () => void
  toggleFullscreen?: () => void
  exitFullscreen?: () => void
}

interface PlayerShortcutOptions {
  rootRef: RefObject<HTMLElement | null>
  blocked: boolean
  actions: PlayerShortcutActions
}

/** 全局快捷键只在当前播放器内生效，并避开可编辑控件和打开的面板。 */
export const usePlayerShortcuts = ({ rootRef, blocked, actions }: PlayerShortcutOptions) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (blocked || event.defaultPrevented || event.repeat) return
      if (!rootRef.current?.isConnected || isEditableTarget(event.target)) return

      const key = event.key.toLowerCase()
      let handled = true

      if (event.code === 'Space' || key === 'k') actions.togglePlayback()
      else if (key === 'arrowleft') actions.seekBy(-5)
      else if (key === 'arrowright') actions.seekBy(5)
      else if (key === 'arrowup') actions.changeVolume(0.05)
      else if (key === 'arrowdown') actions.changeVolume(-0.05)
      else if (key === 'm') actions.toggleMuted()
      else if (key === 'f' && actions.toggleFullscreen) actions.toggleFullscreen()
      else if (key === 'escape' && actions.exitFullscreen) actions.exitFullscreen()
      else handled = false

      if (handled) event.preventDefault()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [actions, blocked, rootRef])
}

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}
