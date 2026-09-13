import posthog from 'posthog-js'

import { configureFeatureFlagReader } from '../../flags'
import { createPostHogTelemetryClient } from '../client'
import { createPostHogOptions } from '../options'

export const initializePostHogTarget = (key: string) => {
  posthog.init(key, createPostHogOptions())
  configureFeatureFlagReader((flag) => posthog.getFeatureFlag(flag) ?? undefined)
  return createPostHogTelemetryClient(posthog)
}
