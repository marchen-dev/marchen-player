import type { ErrorState } from '@marchen/player-loading'
import type { LoadFailureAction } from '@renderer/services/player-loading/load-failure'
import type { FC } from 'react'
import { openFeedbackDialog } from '@renderer/atoms/feedback'
import { Button } from '@renderer/components/ui/button'
import { RouteName } from '@renderer/router/name'
import { usePlayerLoadingService } from '@renderer/services/player-loading/hooks'
import { getLastImportOperationId } from '@renderer/services/telemetry/local-log'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { openRemoteVideoDialog } from './RemoteVideoDialog'

const ACTION_LABELS: Record<LoadFailureAction, string> = {
  retry: '重试',
  change_link: '更换链接',
  reselect: '重新选择视频',
  open_source: '前往媒体源',
}

interface LoadFailureActionsProps {
  state: ErrorState
  title: string
  actions: LoadFailureAction[]
  /** 本地文件重新选择；由播放页提供，未提供时不显示该操作 */
  onReselect?: () => void
}

/**
 * 加载失败的操作区：主操作 + 返回，下方是错误详情与反馈入口。
 * 与加载进度共用同一布局，失败时界面原地切换而不是弹出浮层。
 */
export const LoadFailureActions: FC<LoadFailureActionsProps> = ({
  state,
  title,
  actions,
  onReselect,
}) => {
  const service = usePlayerLoadingService()
  const navigate = useNavigate()
  const [detailOpen, setDetailOpen] = useState(false)
  const detail = state.error.message
  const available = actions.filter((action) => action !== 'reselect' || onReselect)

  const run = (action: LoadFailureAction) => {
    const remote = state.remoteRequest
    const provider = state.providerRequest
    switch (action) {
      case 'retry':
        if (provider) service.loadFromProvider(provider.sourceId, provider.itemRef)
        else if (remote) service.loadFromUrl(remote.url, remote.recordId)
        return
      case 'change_link':
        if (remote) openRemoteVideoDialog(remote.url, remote.recordId)
        return
      case 'reselect':
        onReselect?.()
        return
      case 'open_source':
        if (!provider) return
        // 先结束这次失败的加载，回到播放页时是空态而不是停在失败界面
        service.cancel()
        navigate(`${RouteName.MEDIA_SOURCES}?source=${encodeURIComponent(provider.sourceId)}`)
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        {available.map((action, index) => (
          <Button
            key={action}
            variant={index === 0 ? 'default' : 'secondary'}
            onClick={() => run(action)}
          >
            {ACTION_LABELS[action]}
          </Button>
        ))}
        <Button variant="ghost" onClick={() => service.cancel()}>
          返回
        </Button>
      </div>

      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <button
          type="button"
          aria-expanded={detailOpen}
          className="hover:text-foreground"
          onClick={() => setDetailOpen((open) => !open)}
        >
          错误详情
        </button>
        <span aria-hidden>·</span>
        <button
          type="button"
          className="hover:text-foreground"
          onClick={() => {
            // Web 全屏作用于播放器元素，弹窗挂在 body 上会被遮挡，先退出全屏
            if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
            // 预填失败说明与底层错误，并关联最近一次导入操作，后台可直接定位这次失败
            openFeedbackDialog({
              source: 'playback_error',
              prefill: `播放失败：${title}\n错误详情：${detail}\n`,
              operationId: getLastImportOperationId(),
            })
          }}
        >
          反馈问题
        </button>
      </div>

      {detailOpen && (
        <pre className="bg-muted text-muted-foreground max-h-24 w-full overflow-auto rounded-md px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap select-text">
          {detail}
        </pre>
      )}
    </div>
  )
}
