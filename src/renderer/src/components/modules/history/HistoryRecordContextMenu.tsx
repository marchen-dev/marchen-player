import type { HistoryRecordView } from '@renderer/services/history/records'
import type { FC, ReactNode } from 'react'
import type { HistoryRecordActions } from './use-history-record-actions'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@renderer/components/ui/menu'
import { isWindows } from '@renderer/lib/utils'

interface HistoryRecordContextMenuProps {
  record: HistoryRecordView
  actions: HistoryRecordActions
  /** 该记录对应加载服务当前持有的视频时不允许删除 */
  deleteDisabled: boolean
  children: ReactNode
}

// 播放记录仅 Electron 可见，平台只需区分 Windows 与 macOS
const revealLabel = isWindows ? '在资源管理器中显示' : '在 Finder 中显示'

/** 播放记录卡片的右键菜单 */
export const HistoryRecordContextMenu: FC<HistoryRecordContextMenuProps> = ({
  record,
  actions,
  deleteDisabled,
  children,
}) => (
  <ContextMenu>
    <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
    <ContextMenuContent className="min-w-44">
      <ContextMenuItem onSelect={() => actions.play(record)}>
        <i className="icon-[mingcute--play-line] mr-2 size-4" />
        播放
      </ContextMenuItem>

      {/* 远程链接没有磁盘文件，不提供定位入口 */}
      {record.localPath && (
        <ContextMenuItem onSelect={() => actions.reveal(record)}>
          <i className="icon-[mingcute--folder-open-line] mr-2 size-4" />
          {revealLabel}
        </ContextMenuItem>
      )}

      <ContextMenuSeparator />

      <ContextMenuItem
        disabled={deleteDisabled}
        className="text-destructive focus:text-destructive"
        onSelect={() => actions.remove(record)}
      >
        <i className="icon-[mingcute--delete-2-line] mr-2 size-4" />
        删除记录…
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
)
