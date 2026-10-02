import type { DB_Library, DB_LibraryEpisode } from '@renderer/database/schemas/library'
import type { LibraryCardActions } from './LibraryCardContextMenu'
import type { LibrarySource } from './selectors'
import { MatchDanmakuDialog } from '@renderer/components/modules/shared/MatchDanmakuDialog'
import { VideoDropZone } from '@renderer/components/modules/shared/VideoDropZone'
import { useToast } from '@renderer/components/ui/toast'
import { db } from '@renderer/database/db'
import {
  markAllEpisodesWatched,
  removeLibraryEntry,
  resetLibraryProgress,
} from '@renderer/database/lib/library-writer'
import { useConfirmationDialog } from '@renderer/hooks/use-dialog'
import { usePageHeader } from '@renderer/hooks/use-page-header'
import { usePlayAnimeFailedToast } from '@renderer/hooks/use-toast'
import { ipcClient } from '@renderer/lib/client'
import { checkIsVideoType } from '@renderer/lib/utils'
import { RouteName } from '@renderer/router'
import { selectFileBatch } from '@renderer/services/player-loading/file-playlist'
import { usePlayerLoadingService } from '@renderer/services/player-loading/hooks'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { reportOperationalError } from '@renderer/services/telemetry/operational-errors'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo, useState } from 'react'

import { useNavigate } from 'react-router'
import { DetailOverlay } from './DetailOverlay'
import { EmptyState } from './EmptyState'
import { Hero } from './Hero'
import { LandscapeCard } from './LandscapeCard'
import { LibraryShell } from './LibraryShell'
import { PosterGrid } from './PosterGrid'
import { Rail } from './Rail'
import {
  mergeLibrarySource,
  pickContinueWatching,
  pickFeatured,
  pickNextEpisode,
} from './selectors'

const MAX_ALL = 50
const MAX_CONTINUE = 10

interface LastWatchedInfo {
  thumbnails: Map<number, string>
  progress: Map<number, { episodeNumber: number; ratio: number }>
}

/**
 * 跨挂载保留的最近一次查询结果。页面每次进入都会重新挂载，
 * 没有缓存时首帧会先渲染空状态 / 海报再切换成真实内容，造成闪烁。
 */
const viewCache: {
  library?: DB_Library[]
  lastWatched?: LastWatchedInfo
  sources?: Map<number, LibrarySource>
} = {}

async function loadLastWatchedInfo(items: DB_Library[]): Promise<LastWatchedInfo> {
  const thumbnails = new Map<number, string>()
  const progress = new Map<number, { episodeNumber: number; ratio: number }>()
  const hashes = items
    .map((s) => s.episodes.find((e) => e.episodeId === s.lastWatchedEpisodeId)?.fileHash)
    .filter((h): h is string => !!h)
  if (hashes.length === 0) return { thumbnails, progress }
  const records = await db.history.bulkGet(hashes)
  const byHash = new Map(
    records.filter((r): r is NonNullable<typeof r> => !!r).map((r) => [r.hash, r]),
  )
  for (const s of items) {
    const ep = s.episodes.find((e) => e.episodeId === s.lastWatchedEpisodeId)
    if (!ep?.fileHash) continue
    const rec = byHash.get(ep.fileHash)
    if (!rec) continue
    if (rec.thumbnail) thumbnails.set(s.animeId, rec.thumbnail)
    if (rec.duration && rec.duration > 0) {
      progress.set(s.animeId, {
        episodeNumber: ep.episodeNumber,
        ratio: Math.min(1, Math.max(0, rec.progress / rec.duration)),
      })
    }
  }
  return { thumbnails, progress }
}

/** 汇总每部作品已导入剧集的来源：本地文件、远程 URL 或两者兼有 */
async function loadLibrarySources(items: DB_Library[]): Promise<Map<number, LibrarySource>> {
  const sources = new Map<number, LibrarySource>()
  const owner = new Map<string, number>()
  for (const s of items) {
    for (const ep of s.episodes) if (ep.fileHash) owner.set(ep.fileHash, s.animeId)
  }
  if (owner.size === 0) return sources
  await db.history
    .where('hash')
    .anyOf([...owner.keys()])
    .each((rec) => {
      const animeId = owner.get(rec.hash)
      const kind = rec.source?.kind
      if (animeId == null) return
      if (kind === 'electron-file') {
        sources.set(animeId, mergeLibrarySource(sources.get(animeId), 'local'))
      } else if (kind === 'remote-url') {
        sources.set(animeId, mergeLibrarySource(sources.get(animeId), 'remote'))
      }
    })
  return sources
}

export default function Library() {
  const navigate = useNavigate()
  const service = usePlayerLoadingService()
  const { showFailedToast } = usePlayAnimeFailedToast()
  const { toast } = useToast()
  const confirm = useConfirmationDialog()

  // 查询结果先用上次进入时的缓存渲染首帧，后台查询完成后再静默替换，避免每次进入闪烁
  const libraryData = useLiveQuery(
    async () => (viewCache.library = await db.library.toArray()),
    [],
    viewCache.library,
  )
  const shows = useMemo<DB_Library[]>(() => libraryData ?? [], [libraryData])

  // 上次播放集的 history：thumbnail + 单集进度比例。只读每部作品一条记录，保持轻量
  const lastWatchedInfo = useLiveQuery(
    async () => (viewCache.lastWatched = await loadLastWatchedInfo(libraryData ?? [])),
    [libraryData],
    viewCache.lastWatched,
  )
  const thumbnailMap = lastWatchedInfo?.thumbnails
  const progressMap = lastWatchedInfo?.progress

  // 全部已导入集的媒体来源（本地 / 远程）。需读取更多记录，单独查询，不拖慢封面与进度
  const sourceMap = useLiveQuery(
    async () => (viewCache.sources = await loadLibrarySources(libraryData ?? [])),
    [libraryData],
    viewCache.sources,
  )

  const [selectedAnime, setSelectedAnime] = useState<DB_Library | null>(null)

  // 排序键：最近播放优先，未播放回退到加入时间。截前 MAX_ALL
  const allShows = useMemo(() => {
    const key = (x: DB_Library) => Date.parse(x.lastWatchedAt || x.addedAt) || 0
    return [...shows].sort((a, b) => key(b) - key(a)).slice(0, MAX_ALL)
  }, [shows])
  const continueWatching = useMemo(
    () => pickContinueWatching(shows).slice(0, MAX_CONTINUE),
    [shows],
  )
  const featured = useMemo(() => pickFeatured(shows), [shows])

  const playEpisode = useCallback(
    (episode: DB_LibraryEpisode) => {
      if (!episode.fileHash) return
      captureFeatureUsed('library', 'play_episode')
      setSelectedAnime(null)
      navigate(RouteName.PLAYER, { state: { hash: episode.fileHash } })
    },
    [navigate],
  )

  const onCardClick = useCallback((item: DB_Library) => {
    captureFeatureUsed('library', 'open_details')
    setSelectedAnime(item)
  }, [])

  const importDroppedVideo = useCallback(
    (file: File) => {
      if (!checkIsVideoType(file.name)) {
        showFailedToast({
          title: '格式错误',
          description: '请选择 MP4、MKV、MOV、WebM 或 TS 等支持的视频文件',
        })
        return
      }
      navigate(RouteName.PLAYER)
      captureFeatureUsed('library', 'drop_video')
      service.loadFromFile(file)
    },
    [navigate, service, showFailedToast],
  )

  // 直接播放下一集；无可播放（fileHash 缺失）时 fallback 打开详情让用户挑集
  const playOrOpen = useCallback(
    (item: DB_Library) => {
      const next = pickNextEpisode(item)
      if (next) playEpisode(next)
      else setSelectedAnime(item)
    },
    [playEpisode],
  )

  // 卡片右键菜单动作。整体 memo 保持引用稳定，避免 memo 化的卡片无谓重渲染
  const cardActions = useMemo<LibraryCardActions>(
    () => ({
      onPlay: (item) => {
        captureFeatureUsed('library', 'context_play')
        const next = pickNextEpisode(item)
        if (next) playEpisode(next)
      },
      onDetails: (item) => {
        captureFeatureUsed('library', 'context_details')
        setSelectedAnime(item)
      },
      onMarkAllWatched: (item) => {
        captureFeatureUsed('library', 'context_mark_all_watched')
        void markAllEpisodesWatched(item.animeId)
      },
      onResetProgress: (item) => {
        captureFeatureUsed('library', 'context_reset_progress')
        void resetLibraryProgress(item.animeId)
      },
      onRevealInFolder: (item) => {
        captureFeatureUsed('library', 'context_reveal_in_folder')
        void revealInFolder(item).then((ok) => {
          if (ok) return
          toast({
            title: '无法定位文件',
            description: '视频文件可能已被移动或删除',
            variant: 'destructive',
          })
        })
      },
      onRemove: (item) => {
        void confirm({
          title: `从影视库移除「${item.title}」？播放记录会保留，再次播放时会重新加入。`,
          handleConfirm: () => {
            captureFeatureUsed('library', 'context_remove')
            // 详情正展示被移除的作品时一并关闭，避免停留在已删除条目上
            setSelectedAnime((current) => (current?.animeId === item.animeId ? null : current))
            void removeLibraryEntry(item.animeId)
          },
        })
      },
    }),
    [confirm, playEpisode, toast],
  )

  const headerState = useMemo(() => ({ title: '影视库', actions: null }), [])
  usePageHeader(headerState)

  // 首次进入且查询未返回时只渲染空外壳，不把「加载中」误显示成空状态
  const content =
    libraryData === undefined ? null : shows.length === 0 ? (
      <>
        <EmptyState variant="empty" />
      </>
    ) : (
      <>
        {featured && (
          <Hero
            item={featured}
            onPlay={() => playOrOpen(featured)}
            onDetails={() => setSelectedAnime(featured)}
            playDisabled={!pickNextEpisode(featured)}
            episodePct={progressMap?.get(featured.animeId)}
          />
        )}

        {continueWatching.length > 0 && (
          <Rail title="继续观看" sub="CONTINUE WATCHING">
            {continueWatching.map((item) => (
              <LandscapeCard
                key={item.animeId}
                item={item}
                thumbnail={thumbnailMap?.get(item.animeId)}
                episodePct={progressMap?.get(item.animeId)}
                source={sourceMap?.get(item.animeId)}
                onClick={() => playOrOpen(item)}
                actions={cardActions}
              />
            ))}
          </Rail>
        )}

        <PosterGrid
          title="所有作品"
          sub={`LIBRARY · ${allShows.length}`}
          items={allShows}
          onCardClick={onCardClick}
          cardActions={cardActions}
          sources={sourceMap}
        />

        {selectedAnime && (
          <DetailOverlay
            item={selectedAnime}
            onClose={() => setSelectedAnime(null)}
            onPlayEpisode={playEpisode}
          />
        )}
      </>
    )

  return (
    <VideoDropZone
      active={selectedAnime == null}
      onFileDrop={(_file, files) => {
        const first = selectFileBatch(files)[0]
        if (first) importDroppedVideo(first)
      }}
      className="size-full"
    >
      <LibraryShell>
        {content}
        <MatchDanmakuDialog />
      </LibraryShell>
    </VideoDropZone>
  )
}

/**
 * 在系统文件管理器中定位作品的视频文件：优先 lastWatched 集，否则按集号取首个已导入集。
 * 只有 Electron 本地文件（history.source.kind === 'electron-file'）才有可定位的路径。
 * 返回 false 表示找不到可用路径或主进程定位失败，由调用方提示用户。
 */
async function revealInFolder(item: DB_Library): Promise<boolean> {
  const imported = [...item.episodes]
    .filter((ep) => !!ep.fileHash)
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
  const last = imported.find((ep) => ep.episodeId === item.lastWatchedEpisodeId)
  const candidates = last ? [last, ...imported.filter((ep) => ep !== last)] : imported

  const records = await db.history.bulkGet(candidates.map((ep) => ep.fileHash!))
  const source = records.find((r) => r?.source?.kind === 'electron-file')?.source
  if (source?.kind !== 'electron-file') return false

  try {
    await ipcClient?.app.showItemInFolder({ path: source.path })
    return true
  } catch (error) {
    // 文件被移动属于可预期的外部状态变化，按已恢复（提示用户）上报
    reportOperationalError('ipc', 'library.show_item_in_folder', error, true)
    return false
  }
}
