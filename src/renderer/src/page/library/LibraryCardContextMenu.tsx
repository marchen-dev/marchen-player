import type { DB_Library } from '@renderer/database/schemas/library'
import type { FC, ReactNode } from 'react'
import type { LibrarySource } from './selectors'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@renderer/components/ui/menu'

import { isWindows } from '@renderer/lib/utils'
import { hasLocalSource, isCompleted, pickNextEpisode } from './selectors'

/** 右键菜单可触发的动作；由影视库页面统一实现，卡片只负责转发 */
export interface LibraryCardActions {
  onPlay: (item: DB_Library) => void
  onDetails: (item: DB_Library) => void
  onMarkAllWatched: (item: DB_Library) => void
  onResetProgress: (item: DB_Library) => void
  onRevealInFolder: (item: DB_Library) => void
  onRemove: (item: DB_Library) => void
}

interface LibraryCardContextMenuProps {
  item: DB_Library
  actions: LibraryCardActions
  /** 已导入剧集的媒体来源；只有存在本地文件时才提供「在 Finder 中显示」 */
  source?: LibrarySource
  children: ReactNode
}

// 影视库仅 Electron 可见，平台只需区分 Windows 与 macOS
const revealLabel = isWindows ? '在资源管理器中显示' : '在 Finder 中显示'

/**
 * 影视库卡片（继续观看横向卡 / 所有作品海报卡）共用的右键菜单。
 * 菜单内容 Portal 到 body，脱离 data-page="library" 的 token scope，
 * 因此沿用全局 popover 样式，与应用其他浮层保持一致。
 */
export const LibraryCardContextMenu: FC<LibraryCardContextMenuProps> = ({
  item,
  actions,
  source,
  children,
}) => {
  const next = pickNextEpisode(item)
  const completed = isCompleted(item)
  // 远程 URL 播放的作品没有磁盘文件，不提供定位入口；具体路径在点击时再查 history
  const canReveal = hasLocalSource(source)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        <ContextMenuItem disabled={!next} onSelect={() => actions.onPlay(item)}>
          <i className="icon-[mingcute--play-line] mr-2 size-4" />
          {next ? `播放 · 第 ${String(next.episodeNumber).padStart(2, '0')} 话` : '播放'}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onDetails(item)}>
          <i className="icon-[mingcute--information-line] mr-2 size-4" />
          查看详情
        </ContextMenuItem>

        <ContextMenuSeparator />

        {completed ? (
          <ContextMenuItem onSelect={() => actions.onResetProgress(item)}>
            <i className="icon-[mingcute--refresh-2-line] mr-2 size-4" />
            重置观看进度
          </ContextMenuItem>
        ) : (
          <ContextMenuItem
            disabled={item.episodes.length === 0}
            onSelect={() => actions.onMarkAllWatched(item)}
          >
            <i className="icon-[mingcute--check-circle-line] mr-2 size-4" />
            标记全部已看
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        {canReveal && (
          <>
            <ContextMenuItem onSelect={() => actions.onRevealInFolder(item)}>
              <i className="icon-[mingcute--folder-open-line] mr-2 size-4" />
              {revealLabel}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}

        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => actions.onRemove(item)}
        >
          <i className="icon-[mingcute--delete-2-line] mr-2 size-4" />
          从影视库移除…
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
