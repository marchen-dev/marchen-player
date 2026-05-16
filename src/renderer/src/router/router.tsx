import type { NonIndexRouteObject, RouteObject } from 'react-router'
import App from '@renderer/App'
import ErrorView from '@renderer/components/common/ErrorView'
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
