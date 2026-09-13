import { telemetry } from './client'

let previousRoute: string | undefined

export const captureStablePageView = (route: string): boolean => {
  if (route === previousRoute) return false
  const previous = previousRoute
  previousRoute = route
  telemetry.capture('page_viewed', { route, previous_route: previous })
  return true
}

export const resetPageViewStateForTest = (): void => {
  previousRoute = undefined
}
