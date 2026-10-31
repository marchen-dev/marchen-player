/**
 * VideoProvider：根据 service state 决定渲染加载 UI / 对话框 / 播放器
 *
 * 零 useEffect 业务逻辑——只订阅 state$ 做纯渲染。
 * 所有操作通过 service 方法触发。
 */

import type { FC, PropsWithChildren } from 'react'
import { MatchAnimeDialog } from '@renderer/components/modules/player/loading/dialog/MatchAnimeDialog'
import { LoadingProgress } from '@renderer/components/modules/player/loading/LoadingProgress'
import {
  usePlayerLoadingSelector,
  usePlayerLoadingService,
} from '@renderer/services/player-loading/hooks'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { useRef } from 'react'

import { useLoadingHistoricalAnime } from './hooks'

export const VideoProvider: FC<PropsWithChildren> = ({ children }) => {
  // 处理从历史记录页面导航过来的情况
  useLoadingHistoricalAnime()

  const step = usePlayerLoadingSelector((s) => s.step)
  const service = usePlayerLoadingService()

  // 加载中：显示进度条
  // waiting_user：显示进度条 + 对话框
  // ready/idle：显示 children；reloading 时保持当前播放器可见
  if (step === 'idle' || step === 'ready' || step === 'reloading') {
    return children
  }

  if (step === 'error') {
    // 错误状态短暂显示后回到 idle，允许重试
    return children
  }

  return (
    <>
      {/* 每次新加载按会话重新挂载：进度从 0 开始，延迟显示与按钮计时重新计算 */}
      <LoadingProgress key={service.sessionId} />
      {step === 'waiting_user' && <WaitingUserDialog />}
    </>
  )
}

/**
 * 等待用户选择的对话框
 * 独立组件避免不必要的重渲染
 */
const WaitingUserDialog: FC = () => {
  const service = usePlayerLoadingService()
  const completedRef = useRef(false)
  const state = usePlayerLoadingSelector((s) => (s.step === 'waiting_user' ? s : null))

  if (!state || state.step !== 'waiting_user') return null

  return (
    <MatchAnimeDialog
      matchData={state.matchData}
      onSelected={(params) => {
        completedRef.current = true
        if (!params) {
          captureFeatureUsed('danmaku_match', 'play_now')
          service.playNow()
          return
        }
        captureFeatureUsed('danmaku_match', 'select')
        service.selectMatch(params)
      }}
      onClosed={() => {
        // 稍后选择可能仍在等待本地缓存；用用户意图区分关闭，不能靠异步状态判断。
        if (!completedRef.current && service.currentState.step === 'waiting_user') service.cancel()
      }}
      isLoading
    />
  )
}
