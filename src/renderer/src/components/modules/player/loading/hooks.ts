/**
 * 加载相关的 React hooks（最小化）
 *
 * 只保留 useLoadingHistoricalAnime：处理从历史记录页面导航过来的情况。
 * 其他加载逻辑已迁移到 PlayerLoadingService。
 */

import { RouteName } from '@renderer/router'
import { usePlayerLoadingService } from '@renderer/services/player-loading/hooks'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'

/**
 * 处理从历史记录页面导航到播放页面的情况
 * 读取 location.state 中的 hash，触发 service.loadFromPath
 */
export const useLoadingHistoricalAnime = () => {
  const service = usePlayerLoadingService()
  const location = useLocation()
  const navigate = useNavigate()
  const effectOnce = useRef(false)
  const hash = location.state?.hash

  useEffect(() => {
    if (!effectOnce.current) {
      effectOnce.current = true
      // 清除 location state，防止刷新时重复加载
      navigate(location.pathname, { replace: true })
      if (hash && location.pathname === RouteName.PLAYER) {
        // 从历史记录续播：通过 service 加载
        // 这里需要从 IndexedDB 获取 path，然后调用 loadFromPath
        import('@renderer/database/db').then(({ db }) => {
          db.history.get({ hash }).then((anime) => {
            if (anime?.path) {
              service.loadFromPath(anime.path)
            }
          })
        })
      }
    }
  }, [hash])
}
