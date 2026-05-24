import type { DB_Library, DB_LibraryEpisode } from '@renderer/database/schemas/library'
import { MatchDanmakuDialog } from '@renderer/components/modules/shared/MatchDanmakuDialog'
import { db } from '@renderer/database/db'
import { usePageHeader } from '@renderer/hooks/use-page-header'
import { RouteName } from '@renderer/router'
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
import { pickContinueWatching, pickFeatured, pickNextEpisode } from './selectors'

const MAX_ALL = 50
const MAX_CONTINUE = 10

export default function Library() {
  const navigate = useNavigate()

  const libraryData = useLiveQuery(() => db.library.toArray())
  const shows = useMemo<DB_Library[]>(() => libraryData ?? [], [libraryData])

  // 拉取每部 anime 上次播放集的 history 记录，得到 thumbnail + 单集进度比例
  const lastWatchedInfo = useLiveQuery(async () => {
    const thumbnails = new Map<number, string>()
    const progress = new Map<number, { episodeNumber: number, ratio: number }>()
    const items = libraryData ?? []
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
  }, [libraryData])
  const thumbnailMap = lastWatchedInfo?.thumbnails
  const progressMap = lastWatchedInfo?.progress

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
      setSelectedAnime(null)
      navigate(RouteName.PLAYER, { state: { hash: episode.fileHash } })
    },
    [navigate],
  )

  const onCardClick = useCallback((item: DB_Library) => {
    setSelectedAnime(item)
  }, [])

  // 直接播放下一集；无可播放（fileHash 缺失）时 fallback 打开详情让用户挑集
  const playOrOpen = useCallback(
    (item: DB_Library) => {
      const next = pickNextEpisode(item)
      if (next) playEpisode(next)
      else setSelectedAnime(item)
    },
    [playEpisode],
  )

  const headerState = useMemo(() => ({ title: '影视库', actions: null }), [])
  usePageHeader(headerState)

  if (shows.length === 0) {
    return (
      <LibraryShell>
        <EmptyState variant="empty" />
        <MatchDanmakuDialog />
      </LibraryShell>
    )
  }

  return (
    <LibraryShell>
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
              onClick={() => playOrOpen(item)}
            />
          ))}
        </Rail>
      )}

      <PosterGrid
        title="所有作品"
        sub={`LIBRARY · ${allShows.length}`}
        items={allShows}
        onCardClick={onCardClick}
      />

      {selectedAnime && (
        <DetailOverlay
          item={selectedAnime}
          onClose={() => setSelectedAnime(null)}
          onPlayEpisode={playEpisode}
        />
      )}

      <MatchDanmakuDialog />
    </LibraryShell>
  )
}
