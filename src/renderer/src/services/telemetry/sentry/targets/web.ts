import * as Sentry from '@sentry/react'

import { createSentryTelemetryClient } from '../client'
import { createRendererSentryOptions } from '../options'

export const initializeSentryTarget = () => {
  Sentry.init(createRendererSentryOptions())
  return createSentryTelemetryClient()
}
