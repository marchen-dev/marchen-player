import type { FC, PropsWithChildren } from 'react'
import { useClearPlayingVideo } from '@renderer/atoms/player'
import { RouteName } from '@renderer/router'
import { useEffect } from 'react'
import { useLocation } from 'react-router'

export const RootLayout: FC<PropsWithChildren> = ({ children }) => {
  const location = useLocation()
  const clearPlayingVideo = useClearPlayingVideo()

  // 确保切换路由时，能够清除播放器状态
  useEffect(() => {
    if (location.pathname !== RouteName.PLAYER) {
      clearPlayingVideo()
    }
  }, [location.pathname])

  return <div className="flex h-screen overflow-hidden">{children}</div>
}
