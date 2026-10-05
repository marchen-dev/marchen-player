import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { ScrollArea } from '@renderer/components/ui/scrollArea'
import { useAtom } from 'jotai'

import { playbackHistoryDialogAtom } from './dialog-state'
import { HistoryRecordCard } from './HistoryRecordCard'
import { useHistoryRecordActions, useLoadedVideoHash } from './use-history-record-actions'
import { useHistoryRecords } from './use-history-records'

/**
 * 弹窗最多展示的记录数。每条 history 记录带着完整弹幕，读取有一次性开销，
 * 这里不做分页与虚拟滚动，用上限控制读取量。
 */
const DIALOG_RECORD_LIMIT = 200

/**
 * 播放记录弹窗：以文件为粒度列出最近播放的视频，匹配与未匹配的都包含。
 * 在应用根部挂载一次，由 openPlaybackHistoryDialog 打开。
 */
export function PlaybackHistoryDialog() {
  const [open, setOpen] = useAtom(playbackHistoryDialogAtom)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="flex h-[680px] max-h-[80vh] flex-col sm:max-w-[860px]"
        aria-describedby={undefined}
      >
        {/* 内容仅在弹窗打开时挂载：关闭期间不查询、不保留上百条缩略图 */}
        <PlaybackHistoryBody />
      </DialogContent>
    </Dialog>
  )
}

const PlaybackHistoryBody = () => {
  const records = useHistoryRecords(DIALOG_RECORD_LIMIT)
  const actions = useHistoryRecordActions()
  const loadedHash = useLoadedVideoHash()

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-baseline gap-3 text-xl">
          播放记录
          {!!records?.length && (
            <span className="text-muted-foreground text-sm font-normal">
              {records.length >= DIALOG_RECORD_LIMIT
                ? `最近 ${DIALOG_RECORD_LIMIT} 条`
                : `共 ${records.length} 条`}
            </span>
          )}
        </DialogTitle>
      </DialogHeader>

      {/* 查询未返回时留白，不把「加载中」误显示成空状态 */}
      {records === undefined ? null : records.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2">
          <i aria-hidden="true" className="icon-[mingcute--history-line] text-4xl" />
          <p className="text-sm">还没有播放记录</p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          {/* 内边距给键盘焦点环留出空间，右侧额外让开滚动条 */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-3 gap-y-5 p-1 pr-4">
            {records.map((record) => (
              <HistoryRecordCard
                key={record.hash}
                record={record}
                actions={actions}
                deleteDisabled={record.hash === loadedHash}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </>
  )
}
