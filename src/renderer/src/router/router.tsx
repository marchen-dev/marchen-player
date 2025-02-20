import App from '@renderer/App'
import ErrorView from '@renderer/components/common/ErrorView'
import History from '@renderer/page/history'
import { HistoryDetails } from '@renderer/page/history/[animeId]'
import VideoPlayer from '@renderer/page/player'
import type { NonIndexRouteObject, RouteObject } from 'react-router'
import { createHashRouter, Navigate, useLocation } from 'react-router'

import { RouteName } from '.'

export interface SidebarRouteObject extends NonIndexRouteObject {
  meta?: {
    icon: string
    title: string
  }
}

export const siderbarRoutes = [
  {
    path: RouteName.PLAYER,
    meta: {
      icon: 'icon-[mingcute--video-camera-line]',
      title: '视频播放',
    },
    errorElement: <ErrorView />,
    element: <VideoPlayer />,
  },
  // {
  //   path: RouteName.LATEST_ANIME,
  //   meta: {
  //     icon: 'icon-[mingcute--lightning-line]',
  //     title: '最新番剧',
  //   },
  //   element: <LastAnime />,
  // },
  {
    path: RouteName.HISTORY,
    meta: {
      icon: 'icon-[mingcute--history-line]',
      title: '播放记录',
    },
    errorElement: <ErrorView />,
    element: <History />,
  },
  {
    path: `${RouteName.HISTORY}/:animeId`,
    element: <HistoryDetails />,
    errorElement: <ErrorView />,
  },
] satisfies SidebarRouteObject[]

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
    ],
  },
] satisfies RouteObject[]

export const useCurrentRoute = () => {
  const { pathname } = useLocation()
  return siderbarRoutes.find((route) => route.path === pathname)
}

export const reactRouter = createHashRouter(router)
