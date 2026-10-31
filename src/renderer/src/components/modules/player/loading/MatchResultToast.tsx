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

import { showMatchAnimeDialog } from './dialog/hooks'

type Notice = ReturnType<typeof getMatchInfo> & {
  id: number
  open: boolean
  automatic: boolean
  hash: string
}

const getNoticeTitle = (notice: Notice) => {
  if (notice.unmatched) return '未精确匹配'
  if (notice.matchFailed) return '弹幕匹配失败'
  if (notice.failed) {
    if (notice.recoveryFailed) return '弹幕更新失败'
    // 已有可用的在线弹幕时只是刷新失败，例如新番缓存过期后后台更新未成功
    return notice.count > 0 ? '弹幕更新失败' : '已匹配，弹幕加载失败'
  }
  return notice.automatic ? '已自动匹配弹幕' : '已更新弹幕匹配'
}

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
      // 优先播放的后台阶段尚未结束时不提示，结束时（含沿用同一匹配的刷新）再通知
      if (state.background) return
      const settled = before?.step === 'ready' && Boolean(before.background)
      // 只通知加载/重新匹配的完成，切换来源或导入本地弹幕不重复弹出。
      if (before?.step === 'ready' && before.match === state.match && !settled) return
      // 选集弹窗「稍后选择」或失败页直接播放时，用户刚看过结论，开播后不再重复提示
      if (
        !settled &&
        (state.playNowFrom === 'waiting_user' || state.playNowFrom === 'match_failed')
      )
        return
      const info = getMatchInfo(state)
      if (
        (!info.matched && !info.failed && !info.unmatched && !info.matchFailed) ||
        (state.matchOrigin === 'history' && !info.failed && before?.step !== 'reloading')
      )
        return
      setNotice({
        ...info,
        id: ++sequence,
        open: true,
        automatic: state.matchOrigin === 'auto',
        hash: state.video.hash,
      })
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
          className="no-drag-region bg-player-popover player-glass gap-3 space-x-0 border-white/15 p-4 pr-8 text-white shadow-xl"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <ToastTitle>{getNoticeTitle(notice)}</ToastTitle>
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
                {notice.unmatched
                  ? '点此手动匹配'
                  : notice.failed || notice.matchFailed
                    ? '视频可正常播放'
                    : `已加载 ${notice.count.toLocaleString('zh-CN')} 条弹幕`}
              </span>
            </ToastDescription>
          </div>
          <ToastAction
            altText={
              notice.unmatched
                ? '手动选择匹配的剧集'
                : notice.matchFailed
                  ? '重试匹配'
                  : notice.failed
                    ? '重试弹幕加载'
                    : '在弹幕设置中查看完整匹配信息'
            }
            className="border-white/20 text-white hover:bg-white/10 hover:text-white"
            onClick={() => {
              if (notice.unmatched) showMatchAnimeDialog(true, notice.hash)
              else if (notice.matchFailed) service.retryMatch()
              else if (notice.failed && notice.canRetry) service.retryDanmaku()
              else showPlayerSettingsPanel('danmaku')
            }}
          >
            {notice.unmatched
              ? '手动匹配'
              : notice.matchFailed
                ? '重试匹配'
                : notice.failed && notice.canRetry
                  ? '重试弹幕'
                  : '查看'}
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
