import type { NonIndexRouteObject, RouteObject } from 'react-router'
import App from '@renderer/App'
import ErrorView from '@renderer/components/common/ErrorView'
import { isWeb } from '@renderer/lib/utils'
import Library from '@renderer/page/library'
import VideoPlayer from '@renderer/page/player'
import { createHashRouter, Navigate, useLocation } from 'react-router'

import { RouteName } from '.'

export interface SidebarRouteObject extends NonIndexRouteObject {
  meta?: {
    icon: string
    title: string
  }
}

/**
 * 全部潜在 sidebar 路由的定义。LIBRARY 仅在 Electron 下生效——
 * Web 下 library 表永远为空（无本地播放路径），UI 暴露入口会引起困惑，
 * 因此在 Web 环境下直接从可见路由中过滤掉。
 *
 * 直接访问 `/#/library` 的 URL 也由下方的 router 表里 redirect 到 player 兜底。
 */
const allSidebarRoutes = [
  {
    path: RouteName.PLAYER,
    meta: {
      icon: 'icon-[mingcute--video-camera-line]',
      title: '视频播放',
    },
    errorElement: <ErrorView />,
    element: <VideoPlayer />,
  },
  {
    path: RouteName.LIBRARY,
    meta: {
      icon: 'icon-[mingcute--movie-line]',
      title: '影视库',
    },
    errorElement: <ErrorView />,
    element: <Library />,
  },
] satisfies SidebarRouteObject[]

/**
 * 经过平台过滤的 sidebar 路由列表，供：
 *  - sidebar 组件渲染导航项
 *  - 主 router 数组组装 children
 *  - useCurrentRoute 匹配当前路由
 */
export const siderbarRoutes = isWeb
  ? allSidebarRoutes.filter((r) => r.path !== RouteName.LIBRARY)
  : allSidebarRoutes

export const router = [
  {
    path: '/',
    element: <App />,
    errorElement: <ErrorView />,
    children: [
      {
        path: '/',
        element: <Navigate to={RouteName.PLAYER} replace />,
      },
      ...siderbarRoutes,
      // Web 下兜底：用户手动输入 /#/library 也重定向到 /player，
      // 避免遗留入口造成 404。Electron 下因为 siderbarRoutes 已含 LIBRARY，
      // 此条 fallback 不会被命中。
      ...(isWeb
        ? [
            {
              path: RouteName.LIBRARY,
              element: <Navigate to={RouteName.PLAYER} replace />,
            },
          ]
        : []),
    ],
  },
] satisfies RouteObject[]

export const useCurrentRoute = () => {
  const { pathname } = useLocation()
  return siderbarRoutes.find((route) => route.path === pathname)
}

export const reactRouter = createHashRouter(router)
