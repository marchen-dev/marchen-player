import type { HistoryRecordView } from '@renderer/services/history/records'
import type { FC } from 'react'
import type { HistoryRecordActions } from './use-history-record-actions'
import { formatHistoryProgress } from '@renderer/services/history/records'
import { memo, useState } from 'react'

import { HistoryRecordContextMenu } from './HistoryRecordContextMenu'

interface HistoryRecordCardProps {
  record: HistoryRecordView
  actions: HistoryRecordActions
  deleteDisabled: boolean
}

/**
 * 播放记录卡片：16:9 缩略图 + 底部进度线 + 单行标题 + 进度文案。
 * 指针沿用系统箭头。
 */
export const HistoryRecordCard: FC<HistoryRecordCardProps> = memo(
  ({ record, actions, deleteDisabled }) => (
    <HistoryRecordContextMenu record={record} actions={actions} deleteDisabled={deleteDisabled}>
      <button
        type="button"
        title={record.title}
        className="focus-visible:ring-ring flex min-w-0 cursor-default flex-col gap-1.5 rounded-md text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        onClick={() => actions.play(record)}
      >
        <div className="bg-muted relative aspect-video w-full overflow-hidden rounded-md">
          {/* key 绑定图片地址：缩略图重新生成后清掉上一张的失败标记 */}
          <RecordImage key={record.image ?? ''} src={record.image} />
          {record.ratio > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/35">
              <div className="bg-primary h-full" style={{ width: `${record.ratio * 100}%` }} />
            </div>
          )}
        </div>
        <span className="w-full truncate text-xs">{record.title}</span>
        <span className="text-muted-foreground -mt-1 text-xs tabular-nums">
          {formatHistoryProgress(record)}
        </span>
      </button>
    </HistoryRecordContextMenu>
  ),
)
HistoryRecordCard.displayName = 'HistoryRecordCard'

/** 缩略图缺失（未生成、已被清除）或加载失败时显示中性占位，不出现破图 */
const RecordImage: FC<{ src?: string }> = ({ src }) => {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div className="text-muted-foreground/50 grid size-full place-items-center">
        <i aria-hidden="true" className="icon-[mingcute--video-line] text-2xl" />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      draggable={false}
      className="size-full object-cover"
      onError={() => setFailed(true)}
    />
  )
}
