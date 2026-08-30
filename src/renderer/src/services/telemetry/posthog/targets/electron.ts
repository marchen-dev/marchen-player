import posthog from 'posthog-js/dist/module.full.no-external'

import { configureFeatureFlagReader } from '../../flags'
import { createPostHogTelemetryClient } from '../client'
import { createPostHogOptions } from '../options'

export const initializePostHogTarget = (key: string) => {
  posthog.init(key, {
    ...createPostHogOptions(),
    disable_external_dependency_loading: true,
  })
  configureFeatureFlagReader((flag) => posthog.getFeatureFlag(flag) ?? undefined)
  return createPostHogTelemetryClient(posthog)
}
