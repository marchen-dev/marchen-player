import type { PlaylistEntry } from '@renderer/services/player-runtime'
import { hidePlayerSettingsPanel } from '@renderer/atoms/player'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@renderer/components/ui/Tooltip'
import { cn } from '@renderer/lib/utils'
import { usePlayerLoadingSelector } from '@renderer/services/player-loading/hooks'
import { usePlayerPortalContainer } from '@renderer/services/player-runtime'
import { samePlaylistSource } from '@renderer/services/player-runtime/history/playlist'
import { groupPlaylistForDisplay } from '@renderer/services/player-runtime/history/playlist-display'
import { useEffect, useMemo, useRef } from 'react'

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
  const portalContainer = usePlayerPortalContainer()
  const groups = useMemo(() => groupPlaylistForDisplay(entries), [entries])
  const currentRef = useRef<HTMLButtonElement>(null)
  const currentId = entries.find((entry) => samePlaylistSource(entry, video?.source))?.id

  // 打开列表或换集后把当前集滚到可视区域中部，长列表里不用再手动找。
  // 只滚动侧栏自身的 viewport：scrollIntoView 会连带滚动外层 overflow 容器，可能挪动播放器外壳。
  useEffect(() => {
    const current = currentRef.current
    const viewport = current?.closest<HTMLElement>('[data-radix-scroll-area-viewport]')
    if (!current || !viewport) return
    const offset = current.getBoundingClientRect().top - viewport.getBoundingClientRect().top
    viewport.scrollTop += offset - (viewport.clientHeight - current.offsetHeight) / 2
  }, [currentId])

  return (
    <TooltipProvider delayDuration={400}>
      <div className="max-w-full min-w-0 space-y-5 overflow-hidden">
        {groups.map((group) => (
          <section key={group.items[0].entry.id} className="max-w-full min-w-0 space-y-1">
            {group.title && (
              // 组标题是同组文件名的公共部分（通常是作品名），条目只显示差异片段
              <h3 className="line-clamp-2 px-3 pb-1 text-xs leading-5 [overflow-wrap:anywhere] text-[var(--player-settings-muted)]">
                {group.title}
              </h3>
            )}
            <ul className="max-w-full min-w-0 space-y-1 overflow-hidden">
              {group.items.map(({ entry, label }) => {
                const playingVideo = entry.id === currentId
                // 匹配标题只属于当前集，作为第二行补充，主文字与其他条目保持同一套命名
                const matchTitle = playingVideo ? match?.episodeTitle : undefined
                return (
                  <li key={entry.id} className="max-w-full min-w-0 overflow-hidden">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          ref={playingVideo ? currentRef : undefined}
                          type="button"
                          aria-current={playingVideo ? 'true' : undefined}
                          className={cn(
                            'flex min-h-11 w-full max-w-full min-w-0 items-center gap-3 overflow-hidden rounded-lg px-3 py-2 text-left text-sm transition-colors',
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
                          <span className="min-w-0 flex-1">
                            {/* 折叠后仍过长时最多两行，文件名常无空格，需允许任意位置断行 */}
                            <span className="line-clamp-2 leading-5 [overflow-wrap:anywhere]">
                              {label}
                            </span>
                            {matchTitle && (
                              <span className="mt-0.5 block truncate text-xs leading-5 text-white/60">
                                {matchTitle}
                              </span>
                            )}
                          </span>
                          {playingVideo && <span className="shrink-0 text-xs">正在播放</span>}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        container={portalContainer}
                        side="left"
                        sideOffset={10}
                        className="max-w-80 border border-white/11 bg-[rgb(38_38_44/98%)] text-sm leading-6 [overflow-wrap:anywhere] break-words whitespace-normal text-white shadow-lg"
                      >
                        {entry.name}
                      </TooltipContent>
                    </Tooltip>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </TooltipProvider>
  )
}

export default PlayList
