import * as Sentry from '@sentry/react'
import { captureStablePageView } from '../navigation'

interface RouterStateLike {
  location: { pathname: string }
}

interface RouterLike {
  state: RouterStateLike
  subscribe: (listener: (state: RouterStateLike) => void) => () => void
}

interface RouterTracingSink {
  pageLoad: (route: string) => void
  navigation: (route: string) => void
}

export const normalizeTelemetryRoute = (pathname: string): string => {
  if (pathname === '/library') return '/library'
  if (pathname === '/player' || pathname === '/') return '/player'
  return '/unknown'
}

const sentryTracingSink = (): RouterTracingSink => ({
  pageLoad(route) {
    captureStablePageView(route)
    const client = Sentry.getClient()
    if (!client) return
    Sentry.startBrowserTracingPageLoadSpan(client, {
      name: route,
      op: 'pageload',
      attributes: { [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route' },
    })
  },
  navigation(route) {
    captureStablePageView(route)
    const client = Sentry.getClient()
    if (!client) return
    Sentry.startBrowserTracingNavigationSpan(client, {
      name: route,
      op: 'navigation',
      attributes: { [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route' },
    })
  },
})

export const installStableRouterTracing = (
  router: RouterLike,
  sink: RouterTracingSink = sentryTracingSink(),
): (() => void) => {
  let currentRoute = normalizeTelemetryRoute(router.state.location.pathname)
  sink.pageLoad(currentRoute)

  return router.subscribe((state) => {
    const nextRoute = normalizeTelemetryRoute(state.location.pathname)
    if (nextRoute === currentRoute) return
    currentRoute = nextRoute
    sink.navigation(nextRoute)
  })
}
