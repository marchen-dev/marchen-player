import type { LoadingState } from '@marchen/player-loading'
import { showPlayerSettingsPanel } from '@renderer/atoms/player'
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@renderer/components/ui/toast/toast'
import { usePlayerLoadingService } from '@renderer/services/player-loading/hooks'
import { getMatchInfo } from '@renderer/services/player-loading/match-info'
import { useEffect, useState } from 'react'

type Notice = ReturnType<typeof getMatchInfo> & { id: number; open: boolean; automatic: boolean }

/** 挂载在播放器内，Web 全屏时 Toast 仍位于全屏元素之下。 */
export const MatchResultToast = () => {
  const service = usePlayerLoadingService()
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    let previous: LoadingState | undefined
    let sequence = 0
    const subscription = service.state$.subscribe((state) => {
      const before = previous
      previous = state
      if (state.step !== 'ready') {
        setNotice(null)
        return
      }
      // 只通知加载/重新匹配的完成，切换来源或导入本地弹幕不重复弹出。
      if (before?.step === 'ready' && before.match === state.match) return
      if (state.danmakuStatus === 'skipped' && !state.recovery?.message) return
      const info = getMatchInfo(state)
      if (
        (!info.matched && !info.failed) ||
        (state.matchOrigin === 'history' && !info.failed && before?.step !== 'reloading')
      )
        return
      setNotice({ ...info, id: ++sequence, open: true, automatic: state.matchOrigin === 'auto' })
    })
    return () => subscription.unsubscribe()
  }, [service])

  return (
    // 每条通知独立计时，避免上条通知移除时遗留悬停/焦点暂停状态。
    <ToastProvider key={notice?.id} duration={5_000}>
      {notice && (
        <Toast
          key={notice.id}
          data-player-match-toast
          open={notice.open}
          onOpenChange={(open) => setNotice((current) => (current ? { ...current, open } : null))}
          className="no-drag-region gap-3 space-x-0 border-white/15 bg-zinc-900/95 p-4 pr-8 text-white shadow-xl backdrop-blur-xl"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <ToastTitle>
              {notice.failed
                ? notice.recoveryFailed
                  ? '弹幕更新失败'
                  : '已匹配，弹幕加载失败'
                : notice.automatic
                  ? '已自动匹配弹幕'
                  : '已更新弹幕匹配'}
            </ToastTitle>
            <ToastDescription className="space-y-1 text-white/70">
              <span className="block truncate" title={notice.title}>
                {notice.title}
              </span>
              {notice.episode && (
                <span className="block truncate" title={notice.episode}>
                  {notice.episode}
                </span>
              )}
              <span className="block">
                {notice.failed
                  ? '视频可正常播放'
                  : `已加载 ${notice.count.toLocaleString('zh-CN')} 条弹幕`}
              </span>
            </ToastDescription>
          </div>
          <ToastAction
            altText={notice.failed ? '重试弹幕加载' : '在弹幕设置中查看完整匹配信息'}
            className="border-white/20 text-white hover:bg-white/10 hover:text-white"
            onClick={() => {
              if (notice.failed && notice.canRetry) service.retryDanmaku()
              else showPlayerSettingsPanel('danmaku')
            }}
          >
            {notice.failed && notice.canRetry ? '重试弹幕' : '查看'}
          </ToastAction>
          <ToastClose aria-label="关闭匹配提示" className="text-white/60 hover:text-white" />
        </Toast>
      )}
      <ToastViewport
        aria-label="弹幕匹配提示"
        className="absolute top-auto right-0 bottom-0 max-w-[420px] sm:bottom-0"
      />
    </ToastProvider>
  )
}
