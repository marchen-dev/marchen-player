/**
 * VideoProvider：根据 service state 决定渲染加载 UI / 对话框 / 播放器
 *
 * 零 useEffect 业务逻辑——只订阅 state$ 做纯渲染。
 * 所有操作通过 service 方法触发。
 */

import type { FC, PropsWithChildren } from 'react'
import { MatchAnimeDialog } from '@renderer/components/modules/player/loading/dialog/MatchAnimeDialog'
import { LoadingDanmuTimeLine } from '@renderer/components/modules/player/loading/Timeline'
import {
  usePlayerLoadingSelector,
  usePlayerLoadingService,
} from '@renderer/services/player-loading/hooks'

import { useLoadingHistoricalAnime } from './hooks'

export const VideoProvider: FC<PropsWithChildren> = ({ children }) => {
  // 处理从历史记录页面导航过来的情况
  useLoadingHistoricalAnime()

  const step = usePlayerLoadingSelector((s) => s.step)

  // 加载中：显示 stepper
  // waiting_user：显示 stepper + 对话框
  // playing/idle：显示 children
  if (step === 'idle' || step === 'playing' || step === 'reloading') {
    return children
  }

  if (step === 'error') {
    // 错误状态短暂显示后回到 idle，允许重试
    return children
  }

  return (
    <>
      <LoadingDanmuTimeLine />
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
  const state = usePlayerLoadingSelector((s) => (s.step === 'waiting_user' ? s : null))

  if (!state || state.step !== 'waiting_user') return null

  return (
    <MatchAnimeDialog
      matchData={state.matchData}
      onSelected={(params) => {
        if (!params) {
          service.skipDanmaku()
          return
        }
        service.selectMatch(params)
      }}
      onClosed={() => service.cancel()}
      isLoading
    />
  )
}
