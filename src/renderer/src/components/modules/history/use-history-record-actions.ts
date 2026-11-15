import type { HistoryRecordView } from '@renderer/services/history/records'
import { useToast } from '@renderer/components/ui/toast'
import { deleteHistoryRecord } from '@renderer/database/lib/history-writer'
import { useConfirmationDialog } from '@renderer/hooks/use-dialog'
import { ipcClient } from '@renderer/lib/client'
import { t } from '@renderer/lib/i18n'
import { RouteName } from '@renderer/router'
import { usePlayerLoadingSelector } from '@renderer/services/player-loading/hooks'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { reportOperationalError } from '@renderer/services/telemetry/operational-errors'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'

import { closePlaybackHistoryDialog } from './dialog-state'

export interface HistoryRecordActions {
  play: (record: HistoryRecordView) => void
  reveal: (record: HistoryRecordView) => void
  remove: (record: HistoryRecordView) => void
}

/**
 * 播放记录卡片的三个动作。
 * 返回值整体 memo，保持引用稳定，避免 memo 化的卡片无谓重渲染。
 */
export function useHistoryRecordActions(): HistoryRecordActions {
  const navigate = useNavigate()
  const confirm = useConfirmationDialog()
  const { toast } = useToast()

  return useMemo<HistoryRecordActions>(
    () => ({
      play: (record) => {
        captureFeatureUsed('playback_history', 'play')
        closePlaybackHistoryDialog()
        // 与影视库相同：把 hash 放进路由 state，由播放器页的历史加载 hook 统一消费。
        // 已经在播放器页时同样生效，不需要第二条加载路径。
        navigate(RouteName.PLAYER, { state: { hash: record.hash, source: 'history' } })
      },
      reveal: (record) => {
        if (!record.localPath) return
        captureFeatureUsed('playback_history', 'reveal')
        void ipcClient?.app.showItemInFolder({ path: record.localPath }).catch((error) => {
          // 文件被移动属于可预期的外部状态变化，按已恢复（提示用户）上报
          reportOperationalError('ipc', 'history.show_item_in_folder', error, true)
          toast({
            title: t('player:history.revealFailedTitle'),
            description: t('player:history.revealFailedDescription'),
            variant: 'destructive',
          })
        })
      },
      remove: (record) => {
        void confirm({
          // Electron 使用系统确认框，只有标题一处文案，需要把后果一次说清
          title: t('player:history.deleteConfirm', { title: record.title }),
          handleConfirm: () => {
            captureFeatureUsed('playback_history', 'delete')
            void deleteHistoryRecord(record.hash).catch((error) => {
              reportOperationalError('player', 'history.delete', error)
              toast({
                title: t('player:history.deleteFailedTitle'),
                description: t('player:history.deleteFailedDescription'),
                variant: 'destructive',
              })
            })
          },
        })
      },
    }),
    [confirm, navigate, toast],
  )
}

/**
 * 加载服务当前持有的视频 hash。
 * 这条记录在播放期间会持续写入进度，删除后写入会落空，因此不允许删除。
 * 离开播放器页后服务仍保留已加载的视频，所以要读服务状态而不是路由。
 */
export function useLoadedVideoHash(): string | null {
  return usePlayerLoadingSelector((state) =>
    'video' in state ? (state.video?.hash ?? null) : null,
  )
}
