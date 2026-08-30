import type { PropsWithChildren } from 'react'
import { convertDandanplayComments } from '@marchen/danmaku-engine'
import { usePlayerSettingsValue } from '@renderer/atoms/settings/player'
import { usePlayerLoadingSelector } from '@renderer/services/player-loading/hooks'
import {
  usePlaybackClock,
  usePlaybackViewModel,
  usePlayerRuntime,
} from '@renderer/services/player-runtime/context'
import { createContext, use, useCallback, useEffect, useMemo, useRef } from 'react'
import { DomDanmakuRenderer } from './dom-danmaku-renderer'

interface NativeDanmakuContextValue {
  surfaceRef: (node: HTMLDivElement | null) => void
  setExclusionRect: (rect: DOMRect | null) => void
}

const NativeDanmakuContext = createContext<NativeDanmakuContextValue | null>(null)

export const NativeDanmakuProvider = ({ children }: PropsWithChildren) => {
  const runtime = usePlayerRuntime()
  const clock = usePlaybackClock()
  const playback = usePlaybackViewModel()
  const settings = usePlayerSettingsValue()
  const comments = usePlayerLoadingSelector((state) =>
    state.step === 'ready' || state.step === 'reloading' ? state.mergedComments : [],
  )
  const items = useMemo(() => convertDandanplayComments(comments), [comments])
  const rendererRef = useRef<DomDanmakuRenderer | null>(null)
  const unregisterRef = useRef<(() => void) | null>(null)
  const itemsRef = useRef(items)
  const settingsRef = useRef(settings)
  itemsRef.current = items
  settingsRef.current = settings

  const surfaceRef = useCallback(
    (node: HTMLDivElement | null) => {
      unregisterRef.current?.()
      unregisterRef.current = null
      rendererRef.current?.dispose()
      rendererRef.current = null
      if (!node) return

      const renderer = new DomDanmakuRenderer(node, clock, toRendererConfig(settingsRef.current))
      rendererRef.current = renderer
      unregisterRef.current = runtime.registerDisposer('danmaku', () => renderer.dispose())
      renderer.replaceItems(itemsRef.current, clock.now())
    },
    [clock, runtime],
  )

  useEffect(
    () => () => {
      unregisterRef.current?.()
      rendererRef.current?.dispose()
    },
    [],
  )

  useEffect(() => {
    rendererRef.current?.replaceItems(items, clock.now())
  }, [clock, items])

  useEffect(() => {
    rendererRef.current?.updateConfig(toRendererConfig(settings))
  }, [settings])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    if (playback.status === 'playing') renderer.play()
    else renderer.pause()
    if (playback.status === 'seeking') renderer.seek(playback.targetTime)
    if ('rate' in playback) renderer.setRate(playback.rate)
  }, [playback])

  const value = useMemo<NativeDanmakuContextValue>(
    () => ({
      surfaceRef,
      setExclusionRect: (rect) => rendererRef.current?.setExclusionRectFromViewport(rect),
    }),
    [surfaceRef],
  )

  return <NativeDanmakuContext value={value}>{children}</NativeDanmakuContext>
}

export const useNativeDanmaku = () => {
  const context = use(NativeDanmakuContext)
  if (!context) throw new Error('useNativeDanmaku 必须在 NativeDanmakuProvider 中使用')
  return context
}

const toRendererConfig = (settings: ReturnType<typeof usePlayerSettingsValue>) => ({
  enabled: settings.enableDanmaku,
  hoverPause: settings.enableDanmakuHoverPause,
  duration: Number(settings.danmakuDuration) / 1_000,
  fontSize: Number(settings.danmakuFontSize),
  displayArea: Number(settings.danmakuEndArea),
  maxOnScreen: Number(settings.danmakuMaxOnScreen),
})
