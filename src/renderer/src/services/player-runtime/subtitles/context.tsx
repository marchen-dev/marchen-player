import type {
  PlayerRuntime,
  ResolvedSubtitleTrack,
  SubtitleCatalogPort,
  SubtitleTrackDescriptor,
} from '@renderer/services/player-runtime'
import type { PropsWithChildren } from 'react'
import { db } from '@renderer/database/db'
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
  sourceUrl: string
  hash: string
}

export const NativeSubtitleProvider = ({
  video,
  runtime,
  catalog,
  sourceUrl,
  hash,
  children,
}: NativeSubtitleProviderProps) => {
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
      if (option && resolved?.persistencePath && !tags.some((tag) => tag.id === option.historyId)) {
        tags.push({
          id: option.historyId,
          path: resolved.persistencePath,
          index: option.origin === 'embedded' ? option.historyId : undefined,
          title: option.title,
          language: option.language,
        })
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
      setLoading(true)
      setError(null)
      try {
        const resolved = await catalog.resolve(sourceUrl, option)
        adapter.setTrack(resolved.url, resolved.release)
        setSelectedId(option.id)
        if (shouldPersist) await persistSelection(option, resolved)
      } catch (cause) {
        adapter.close()
        setSelectedId('off')
        setError(cause instanceof Error ? cause.message : '字幕加载失败')
      } finally {
        setLoading(false)
      }
    },
    [catalog, persistSelection, sourceUrl],
  )

  useEffect(() => {
    const adapter = new LibassSubtitleAdapter(video)
    adapterRef.current = adapter
    const unregister = runtime.registerDisposer('subtitle', () => adapter.dispose())
    const observer = new ResizeObserver(() => adapter.resize())
    observer.observe(video)
    return () => {
      observer.disconnect()
      unregister()
      adapter.dispose()
      if (adapterRef.current === adapter) adapterRef.current = null
    }
  }, [runtime, video])

  useEffect(() => {
    let cancelled = false
    const initialize = async () => {
      const adapter = adapterRef.current
      if (!adapter) return
      setLoading(true)
      setError(null)
      try {
        const [catalogTracks, history] = await Promise.all([
          catalog.list(sourceUrl),
          db.history.get(hash),
        ])
        if (cancelled) return
        const historyTags = history?.subtitles?.tags ?? []
        const usedHistoryIds = new Set<number>()
        const options: SubtitleTrackOption[] = catalogTracks.map((track) => {
          const embeddedId =
            track.origin === 'embedded' ? Number(track.id.replace('embedded:', '')) : NaN
          const historyId = Number.isInteger(embeddedId)
            ? embeddedId
            : allocateExternalHistoryId(historyTags, usedHistoryIds)
          usedHistoryIds.add(historyId)
          return { ...track, historyId }
        })

        for (const tag of historyTags) {
          const existing = options.find((option) => option.historyId === tag.id)
          if (existing) continue
          const resolved = await catalog.restoreExternal(tag.path, tag.title, `history:${tag.id}`)
          options.push({
            ...resolved,
            historyId: tag.id,
            language: tag.language,
          })
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
        const preferred = selectPreferredSubtitleTrack(options, defaultId)
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
    }
  }, [activateTrack, catalog, hash, sourceUrl])

  const selectTrack = useCallback(
    async (id: string) => {
      const adapter = adapterRef.current
      if (!adapter) return
      if (id === 'off') {
        adapter.close()
        setSelectedId('off')
        setError(null)
        await persistSelection(null)
        return
      }
      const option = tracks.find((track) => track.id === id)
      if (option) await activateTrack(option)
    },
    [activateTrack, persistSelection, tracks],
  )

  const importTrack = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const imported = await catalog.importExternal()
      if (!imported) return
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

  return <NativeSubtitleContext value={value}>{children}</NativeSubtitleContext>
}

export const useNativeSubtitles = () => {
  const context = use(NativeSubtitleContext)
  if (!context) throw new Error('useNativeSubtitles 必须在 NativeSubtitleProvider 中使用')
  return context
}
