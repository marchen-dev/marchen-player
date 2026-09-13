import * as ElectronSentry from '@sentry/electron/renderer'
import * as ReactSentry from '@sentry/react'

import { createSentryTelemetryClient } from '../client'
import { createRendererSentryOptions } from '../options'

export const initializeSentryTarget = () => {
  ElectronSentry.init(createRendererSentryOptions(), ReactSentry.init)
  return createSentryTelemetryClient()
}
