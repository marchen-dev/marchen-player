import type { GenerationSpanSink } from './media-generation'

import * as Sentry from '@sentry/electron/main'

export const sentryGenerationSpanSink: GenerationSpanSink = {
  start: (options) => Sentry.startInactiveSpan(options),
}
