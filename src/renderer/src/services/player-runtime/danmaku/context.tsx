import type { DanmakuItem } from '@marchen/danmaku-engine'
import type { PropsWithChildren } from 'react'
import type { PlaybackVisualStateBridge } from '../fallback-state'
import { convertDandanplayComments } from '@marchen/danmaku-engine'
import { usePlayerSettings } from '@renderer/atoms/settings/player'
import { usePlayerLoadingSelector } from '@renderer/services/player-loading/hooks'
import { usePlaybackClock, usePlayerRuntime } from '@renderer/services/player-runtime/context'
import { createDisplayTextResolver } from '@renderer/services/translation/display-text'
import { danmakuTranslation } from '@renderer/services/translation/service'
import { translationStore } from '@renderer/services/translation/translation-store'
import { createContext, use, useCallback, useEffect, useMemo, useRef } from 'react'
import { blockDanmakuByText } from './block-danmaku-action'
import { collectBlockedIds, createDanmakuBlocker, prepareBlockTexts } from './danmaku-block'
import { DomDanmakuRenderer } from './dom-danmaku-renderer'
import { bindDanmakuPlayback } from './playback-binding'
import { convertDanmakuItemsToSimplified } from './traditional-to-simplified'

interface NativeDanmakuContextValue {
  surfaceRef: (node: HTMLDivElement | null) => void
  setExclusionRect: (rect: DOMRect | null) => void
}

const NativeDanmakuContext = createContext<NativeDanmakuContextValue | null>(null)

const NO_ITEMS: readonly DanmakuItem[] = []
const NO_BLOCKED_IDS: ReadonlySet<string> = new Set()

/** 译文表是全应用共用的一份，解析函数也只需要一个 */
const resolveTranslatedText = createDisplayTextResolver(translationStore)

export const NativeDanmakuProvider = ({
  children,
  fallbackState,
}: PropsWithChildren<{ fallbackState?: PlaybackVisualStateBridge }>) => {
  const runtime = usePlayerRuntime()
  const clock = usePlaybackClock()
  const [settings, setSettings] = usePlayerSettings()
  const {
    danmakuDuration,
    danmakuEndArea,
    danmakuFontSize,
    danmakuOpacity,
    danmakuBlock,
    danmakuMaxOnScreen,
    enableDanmaku,
    enableTraditionalToSimplified,
    danmakuTranslation: { enabled: translationEnabled },
  } = settings
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
      opacity: danmakuOpacity / 100,
      displayArea: Number(danmakuEndArea),
      maxOnScreen: Number(danmakuMaxOnScreen),
    }),
    [
      danmakuDuration,
      danmakuEndArea,
      danmakuFontSize,
      danmakuOpacity,
      danmakuMaxOnScreen,
      enableDanmaku,
    ],
  )
  const comments = usePlayerLoadingSelector((state) =>
    state.step === 'ready' || state.step === 'reloading' ? state.mergedComments : [],
  )
  // 繁简转换只作用于送入渲染器的副本，缓存与 HISTORY 保留原文，开关切换即时生效
  const items = useMemo(() => {
    const converted = convertDandanplayComments(comments)
    return enableTraditionalToSimplified ? convertDanmakuItemsToSimplified(converted) : converted
  }, [comments, enableTraditionalToSimplified])
  // 屏蔽只下发「哪些 id 不出现」，不改 items：规则变化不走 replaceItems，因此不清屏。
  // 归一化文本只依赖弹幕本身，单独缓存；没有任何生效规则时整段跳过，不触发简繁字典初始化。
  const blocker = useMemo(() => createDanmakuBlocker(danmakuBlock), [danmakuBlock])
  const hasBlocker = blocker !== null
  const blockTexts = useMemo(
    () => (hasBlocker ? prepareBlockTexts(items) : []),
    [hasBlocker, items],
  )
  const blockedIds = useMemo(
    () => collectBlockedIds(items, blockTexts, blocker),
    [blockTexts, blocker, items],
  )
  const rendererRef = useRef<DomDanmakuRenderer | null>(null)
  const unregisterRef = useRef<(() => void) | null>(null)
  const itemsRef = useRef(items)
  const configRef = useRef(rendererConfig)
  const blockedIdsRef = useRef(blockedIds)
  // 弹幕翻译只换「显示文本」的来源，不改 items：译文陆续到达、开关切换都不走 replaceItems，
  // 在屏弹幕保持原样，之后出场的弹幕才读到译文。
  const textResolver = translationEnabled ? resolveTranslatedText : null
  const textResolverRef = useRef(textResolver)
  itemsRef.current = items
  blockedIdsRef.current = blockedIds
  configRef.current = rendererConfig
  textResolverRef.current = textResolver

  const surfaceRef = useCallback(
    (node: HTMLDivElement | null) => {
      unregisterRef.current?.()
      unregisterRef.current = null
      rendererRef.current?.dispose()
      rendererRef.current = null
      if (!node) return

      const renderer = new DomDanmakuRenderer(node, clock, configRef.current, {
        onBlock: (text) => blockDanmakuByText(text, 'hover'),
      })
      rendererRef.current = renderer
      renderer.setTextResolver(textResolverRef.current)
      renderer.replaceItems(itemsRef.current, clock.now())
      renderer.setBlockedIds(blockedIdsRef.current)
      const unsubscribe = bindDanmakuPlayback(runtime, renderer)
      const dispose = () => {
        unsubscribe()
        renderer.dispose()
      }
      const unregister = runtime.registerDisposer('danmaku', dispose)
      unregisterRef.current = () => {
        unregister()
        dispose()
      }
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

  // 必须声明在替换弹幕的 effect 之后：换弹幕时先换条目、再下发新的屏蔽集合
  useEffect(() => {
    rendererRef.current?.setBlockedIds(blockedIds)
  }, [blockedIds])

  useEffect(() => {
    rendererRef.current?.updateConfig(rendererConfig)
  }, [rendererConfig])

  useEffect(() => {
    rendererRef.current?.setTextResolver(textResolver)
  }, [textResolver])

  // 播放页挂载期间向翻译服务登记会话；是否真的加载引擎由服务按开关与弹幕内容决定。
  useEffect(() => danmakuTranslation.attach({ now: () => clock.now() }), [clock])

  // 翻译范围与画面一致：同一份条目、同一份屏蔽集合，被屏蔽的弹幕不进入翻译。
  // 会话与条目各自独立登记和撤销，两个 effect 谁先谁后都得到相同的结果。
  useEffect(() => {
    danmakuTranslation.setItems(items, blockedIds)
    return () => danmakuTranslation.setItems(NO_ITEMS, NO_BLOCKED_IDS)
  }, [items, blockedIds])

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
