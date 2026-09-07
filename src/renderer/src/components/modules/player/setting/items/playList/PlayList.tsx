import type { PlaylistEntry } from '@renderer/services/player-runtime'
import { hidePlayerSettingsPanel } from '@renderer/atoms/player'
import { cn } from '@renderer/lib/utils'
import { usePlayerLoadingSelector } from '@renderer/services/player-loading/hooks'
import { samePlaylistSource } from '@renderer/services/player-runtime/history/playlist'

const PlayList = ({
  entries,
  onSelect,
}: {
  entries: readonly PlaylistEntry[]
  onSelect?: (entry: PlaylistEntry) => void
}) => {
  // 从 service state 读取匹配信息和视频信息
  const match = usePlayerLoadingSelector((s) => ('match' in s ? s.match : null))
  const video = usePlayerLoadingSelector((s) => ('video' in s ? s.video : null))

  return (
    <ul className="max-w-full min-w-0 space-y-3 overflow-hidden">
      {entries.map((entry) => {
        const { name, id } = entry
        const playingVideo = samePlaylistSource(entry, video?.source)
        const getTitle = () => {
          if (playingVideo && match?.animeTitle && match?.episodeTitle) {
            return `${match.animeTitle}-${match.episodeTitle}`
          }
          return name
        }
        return (
          <li key={id} className="max-w-full min-w-0 overflow-hidden">
            <button
              type="button"
              aria-current={playingVideo ? 'true' : undefined}
              className={cn(
                'flex min-h-11 w-full max-w-full min-w-0 items-center gap-3 overflow-hidden rounded-lg px-3 text-left text-sm transition-colors',
                'focus-visible:ring-2 focus-visible:ring-[var(--player-settings-focus)] focus-visible:outline-none',
                playingVideo
                  ? 'bg-white/14 text-white'
                  : 'text-[var(--player-settings-muted)] hover:bg-white/8 hover:text-white',
              )}
              onClick={() => {
                if (playingVideo) {
                  return
                }
                hidePlayerSettingsPanel()
                // 通过 service 加载下一集
                onSelect?.(entry)
              }}
            >
              <i
                className={cn(
                  playingVideo
                    ? 'icon-[mingcute--play-circle-fill]'
                    : 'icon-[mingcute--play-circle-line]',
                  'shrink-0 text-lg',
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate" title={getTitle()}>
                {getTitle()}
              </span>
              {playingVideo && <span className="shrink-0 text-xs">正在播放</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export default PlayList
