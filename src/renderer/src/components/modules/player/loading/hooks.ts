/**
 * 加载相关的 React hooks（最小化）
 *
 * 只保留 useLoadingHistoricalAnime：处理从历史记录页面导航过来的情况。
 * 其他加载逻辑已迁移到 PlayerLoadingService。
 */

import { usePlayAnimeFailedToast } from '@renderer/hooks/use-toast'
import { RouteName } from '@renderer/router'
import { usePlayerLoadingService } from '@renderer/services/player-loading/hooks'
import { loadHistoricalVideo } from '@renderer/services/player-loading/load-history'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'

/**
 * 处理从历史记录页面导航到播放页面的情况
 * 读取 location.state 中的 hash，触发 service.loadFromPath
 */
export const useLoadingHistoricalAnime = () => {
  const service = usePlayerLoadingService()
  const { showFailedToast } = usePlayAnimeFailedToast()
  const location = useLocation()
  const navigate = useNavigate()
  const consumedHashRef = useRef<string | null>(null)
  const hash = typeof location.state?.hash === 'string' ? location.state.hash : null

  useEffect(() => {
    if (!hash || location.pathname !== RouteName.PLAYER || consumedHashRef.current === hash) return
    consumedHashRef.current = hash

    // 先消费 state，避免刷新或后续渲染重复加载同一条记录。
    navigate(location.pathname, { replace: true })
    void loadHistoricalVideo(hash, { service }).then((result) => {
      if (result.status === 'loaded') return
      showFailedToast({
        title: '无法继续播放',
        description:
          result.status === 'error'
            ? '读取播放记录失败，请稍后重试'
            : '播放记录已失效，请重新导入视频',
      })
    })
  }, [hash, location.pathname, navigate, service, showFailedToast])
}
