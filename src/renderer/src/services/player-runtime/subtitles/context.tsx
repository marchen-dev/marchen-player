import type { DurableMediaSource } from '@marchen/shared/media'
import type {
  PlaybackVisualStateBridge,
  PlayerRuntime,
  ResolvedSubtitleTrack,
  SubtitleCatalogPort,
  SubtitleTrackDescriptor,
} from '@renderer/services/player-runtime'
import type { PropsWithChildren } from 'react'
import { db } from '@renderer/database/db'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LibassSubtitleAdapter } from './libass-subtitle-adapter'
import { allocateExternalHistoryId, selectPreferredSubtitleTrack } from './preferences'

export interface SubtitleTrackOption extends SubtitleTrackDescriptor {
  historyId: number
}

interface NativeSubtitleContextValue {
  tracks: ReadonlyArray<SubtitleTrackOption>
  selectedId: string
  timeOffset: number
  loading: boolean
  error: string | null
  selectTrack: (id: string) => Promise<void>
  importTrack: () => Promise<void>
  setTimeOffset: (offset: number) => Promise<void>
}

const NativeSubtitleContext = createContext<NativeSubtitleContextValue | null>(null)

interface NativeSubtitleProviderProps extends PropsWithChildren {
  video: HTMLVideoElement
  runtime: PlayerRuntime
  catalog: SubtitleCatalogPort
  source: DurableMediaSource
  hash: string
  fallbackState?: PlaybackVisualStateBridge
}

export const NativeSubtitleProvider = ({
  video,
  runtime,
  catalog,
  source,
  hash,
  fallbackState,
  children,
}: NativeSubtitleProviderProps) => {
  const requestRef = useRef<AbortController | null>(null)
  const adapterRef = useRef<LibassSubtitleAdapter | null>(null)
  const [tracks, setTracks] = useState<SubtitleTrackOption[]>([])
  const [selectedId, setSelectedId] = useState('off')
  const [timeOffset, setTimeOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const persistSelection = useCallback(
    async (option: SubtitleTrackOption | null, resolved?: ResolvedSubtitleTrack) => {
      const history = await db.history.get(hash)
      const previous = history?.subtitles ?? { defaultId: -1, timeOffset: 0, tags: [] }
      const tags = [...previous.tags]
      if (option) {
        const tag = {
          id: option.historyId,
          origin: option.origin,
          embedded: option.embedded,
          path: resolved?.persistencePath,
          content: resolved?.persistenceContent,
          title: option.title,
          language: option.language,
        }
        const index = tags.findIndex((tag) => tag.id === option.historyId)
        if (index >= 0) tags[index] = tag
        else tags.push(tag)
        const bytes = tags.reduce(
          (sum, item) =>
            sum + (item.content ? new TextEncoder().encode(item.content).byteLength : 0),
          0,
        )
        if (bytes > 32 * 1024 * 1024) {
          tag.content = undefined
          setError('字幕已加载；保存内容超过 32 MiB，下次需要重新选择此字幕。')
        }
      }
      await db.history.update(hash, {
        subtitles: {
          ...previous,
          defaultId: option?.historyId ?? -1,
          tags,
        },
      })
    },
    [hash],
  )

  const activateTrack = useCallback(
    async (option: SubtitleTrackOption, shouldPersist = true) => {
      const adapter = adapterRef.current
      if (!adapter) return
      requestRef.current?.abort()
      const request = new AbortController()
      requestRef.current = request
      setLoading(true)
      setError(null)
      try {
        const resolved = await catalog.resolve(source, option, request.signal)
        if (request.signal.aborted) {
          resolved.release?.()
          return
        }
        adapter.setTrack(resolved.url, resolved.release, resolved.fonts)
        setError(resolved.warning ?? null)
        setSelectedId(option.id)
        if (shouldPersist) await persistSelection(option, resolved)
      } catch (cause) {
        if (request.signal.aborted) return
        adapter.close()
        setSelectedId('off')
        setError(cause instanceof Error ? cause.message : '字幕加载失败')
      } finally {
        if (!request.signal.aborted) setLoading(false)
      }
    },
    [catalog, persistSelection, source],
  )

  useEffect(() => {
    const root = video.closest('[data-player-root]')
    const surface = root?.querySelector('[data-player-subtitle-surface]')
    if (!surface || !root) return
    const canvas = document.createElement('canvas')
    canvas.style.position = 'absolute'
    canvas.style.top = '50%'
    canvas.style.left = '50%'
    surface.appendChild(canvas)
    const adapter = new LibassSubtitleAdapter(canvas, runtime.clock)
    adapterRef.current = adapter
    const resize = () => {
      const width = runtime.presentation?.width || video.videoWidth
      const height = runtime.presentation?.height || video.videoHeight
      if (!width || !height) return
      const rotation = Number(video.dataset.rotation || 0)
      const swapped = rotation === 90 || rotation === 270
      const scale = Math.min(
        root.clientWidth / (swapped ? height : width),
        root.clientHeight / (swapped ? width : height),
      )
      const cssWidth = width * scale
      const cssHeight = height * scale
      const pixelRatio = window.devicePixelRatio || 1
      const pixelWidth = Math.max(1, Math.round(cssWidth * pixelRatio))
      const pixelHeight = Math.max(1, Math.round(cssHeight * pixelRatio))
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight
      canvas.style.width = `${cssWidth}px`
      canvas.style.height = `${cssHeight}px`
      canvas.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`
      adapter.resize()
    }
    const unregister = runtime.registerDisposer('subtitle', () => adapter.dispose())
    const observer = new ResizeObserver(resize)
    observer.observe(root)
    const rotationObserver = new MutationObserver(resize)
    rotationObserver.observe(video, { attributes: true, attributeFilter: ['data-rotation'] })
    video.addEventListener('loadedmetadata', resize)
    let dimensions = ''
    let frame = 0
    const tick = () => {
      const nextDimensions = `${runtime.presentation?.width}:${runtime.presentation?.height}`
      if (nextDimensions !== dimensions) {
        dimensions = nextDimensions
        resize()
      }
      adapter.sync()
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(frame)
      video.removeEventListener('loadedmetadata', resize)
      observer.disconnect()
      rotationObserver.disconnect()
      unregister()
      adapter.dispose()
      canvas.remove()
      if (adapterRef.current === adapter) adapterRef.current = null
    }
  }, [runtime, video])

  useEffect(() => {
    let cancelled = false
    const initializeAbort = new AbortController()
    const initialize = async () => {
      const adapter = adapterRef.current
      if (!adapter) return
      adapter.close()
      setTracks([])
      setSelectedId('off')
      setLoading(true)
      setError(null)
      try {
        const [catalogTracks, history] = await Promise.all([
          catalog.list(source, initializeAbort.signal),
          db.history.get(hash),
        ])
        if (cancelled) return
        const historyTags = history?.subtitles?.tags ?? []
        const usedHistoryIds = new Set<number>()
        const options: SubtitleTrackOption[] = catalogTracks.map((track) => {
          const embeddedId =
            track.origin === 'embedded'
              ? (track.embedded?.number ?? Number(track.id.replace('embedded:', '')))
              : NaN
          const historyId = Number.isInteger(embeddedId)
            ? embeddedId
            : allocateExternalHistoryId(historyTags, usedHistoryIds)
          usedHistoryIds.add(historyId)
          return { ...track, historyId }
        })

        for (const tag of historyTags) {
          if (tag.origin !== 'external' || options.some((option) => option.historyId === tag.id))
            continue
          try {
            const resolved = await catalog.restoreExternal(
              tag.path,
              tag.title,
              `history:${tag.id}`,
              tag.content,
            )
            if (cancelled) {
              resolved.release?.()
              return
            }
            options.push({ ...resolved, historyId: tag.id, language: tag.language })
          } catch (cause) {
            if (!cancelled)
              setError(cause instanceof Error ? cause.message : '外挂字幕需要重新选择')
          }
        }
        if (cancelled) return

        const offset = history?.subtitles?.timeOffset ?? 0
        adapter.setTimeOffset(offset)
        setTimeOffset(offset)
        setTracks(options)

        const defaultId = history?.subtitles?.defaultId
        if (defaultId === -1) {
          adapter.close()
          setSelectedId('off')
          return
        }
        const previous = historyTags.find((tag) => tag.id === defaultId)
        const sameTrack = options.find(
          (option) =>
            option.historyId === defaultId &&
            (option.origin === 'external' ||
              (previous?.embedded?.uid === option.embedded?.uid &&
                previous?.embedded?.codec === option.embedded?.codec)),
        )
        const preferred = selectPreferredSubtitleTrack(
          options.filter((option) => option.supported !== false),
          sameTrack?.historyId,
        )
        if (preferred) await activateTrack(preferred)
      } catch (cause) {
        if (!cancelled) {
          adapter.close()
          setError(cause instanceof Error ? cause.message : '字幕初始化失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void initialize()
    return () => {
      cancelled = true
      initializeAbort.abort()
      requestRef.current?.abort()
    }
  }, [activateTrack, catalog, hash, source])

  const selectTrack = useCallback(
    async (id: string) => {
      const adapter = adapterRef.current
      if (!adapter) return
      if (id === 'off') {
        requestRef.current?.abort()
        setLoading(false)
        captureFeatureUsed('subtitle', 'disable')
        adapter.close()
        setSelectedId('off')
        setError(null)
        await persistSelection(null)
        return
      }
      const option = tracks.find((track) => track.id === id)
      if (option) {
        captureFeatureUsed('subtitle', 'select', option.origin)
        await activateTrack(option)
      }
    },
    [activateTrack, persistSelection, tracks],
  )

  const importTrack = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const imported = await catalog.importExternal()
      if (!imported) return
      captureFeatureUsed('subtitle', 'import', 'external')
      const history = await db.history.get(hash)
      const historyId = allocateExternalHistoryId(history?.subtitles?.tags ?? [], new Set())
      const option: SubtitleTrackOption = { ...imported, historyId }
      setTracks((items) => [...items, option])
      await activateTrack(option)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '字幕导入失败')
    } finally {
      setLoading(false)
    }
  }, [activateTrack, catalog, hash])

  const updateTimeOffset = useCallback(
    async (offset: number) => {
      const adapter = adapterRef.current
      if (!adapter) return
      const safeOffset = Math.min(9, Math.max(-9, offset))
      adapter.setTimeOffset(safeOffset)
      setTimeOffset(safeOffset)
      const history = await db.history.get(hash)
      const previous = history?.subtitles ?? { defaultId: -1, tags: [] }
      await db.history.update(hash, { subtitles: { ...previous, timeOffset: safeOffset } })
    },
    [hash],
  )

  const value = useMemo(
    () => ({
      tracks,
      selectedId,
      timeOffset,
      loading,
      error,
      selectTrack,
      importTrack,
      setTimeOffset: updateTimeOffset,
    }),
    [error, importTrack, loading, selectTrack, selectedId, timeOffset, tracks, updateTimeOffset],
  )

  fallbackState?.bindSubtitle({
    selectedId,
    timeOffset,
    selectSubtitle: selectTrack,
    setSubtitleTimeOffset: updateTimeOffset,
  })

  return <NativeSubtitleContext value={value}>{children}</NativeSubtitleContext>
}

export const useNativeSubtitles = () => {
  const context = use(NativeSubtitleContext)
  if (!context) throw new Error('useNativeSubtitles 必须在 NativeSubtitleProvider 中使用')
  return context
}
