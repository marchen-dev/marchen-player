import type { PropsWithChildren } from 'react'
import type { PlaybackVisualStateBridge } from '../fallback-state'
import { convertDandanplayComments } from '@marchen/danmaku-engine'
import { usePlayerSettings } from '@renderer/atoms/settings/player'
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

export const NativeDanmakuProvider = ({
  children,
  fallbackState,
}: PropsWithChildren<{ fallbackState?: PlaybackVisualStateBridge }>) => {
  const runtime = usePlayerRuntime()
  const clock = usePlaybackClock()
  const playback = usePlaybackViewModel()
  const [settings, setSettings] = usePlayerSettings()
  const { danmakuDuration, danmakuEndArea, danmakuFontSize, danmakuMaxOnScreen, enableDanmaku } =
    settings
  fallbackState?.bindDanmaku(enableDanmaku, (enabled) =>
    setSettings((current) => ({ ...current, enableDanmaku: enabled })),
  )
  const rendererConfig = useMemo(
    () => ({
      enabled: enableDanmaku,
      // 悬停暂停固定开启，不读取历史设置中的关闭值。
      hoverPause: true,
      duration: Number(danmakuDuration) / 1_000,
      fontSize: Number(danmakuFontSize),
      displayArea: Number(danmakuEndArea),
      maxOnScreen: Number(danmakuMaxOnScreen),
    }),
    [danmakuDuration, danmakuEndArea, danmakuFontSize, danmakuMaxOnScreen, enableDanmaku],
  )
  const comments = usePlayerLoadingSelector((state) =>
    state.step === 'ready' || state.step === 'reloading' ? state.mergedComments : [],
  )
  const items = useMemo(() => convertDandanplayComments(comments), [comments])
  const rendererRef = useRef<DomDanmakuRenderer | null>(null)
  const unregisterRef = useRef<(() => void) | null>(null)
  const itemsRef = useRef(items)
  const configRef = useRef(rendererConfig)
  itemsRef.current = items
  configRef.current = rendererConfig

  const surfaceRef = useCallback(
    (node: HTMLDivElement | null) => {
      unregisterRef.current?.()
      unregisterRef.current = null
      rendererRef.current?.dispose()
      rendererRef.current = null
      if (!node) return

      const renderer = new DomDanmakuRenderer(node, clock, configRef.current)
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
    rendererRef.current?.updateConfig(rendererConfig)
  }, [rendererConfig])

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
