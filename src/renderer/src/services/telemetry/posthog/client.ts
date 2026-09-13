import type { TelemetryClient } from '../contracts'
import { configureFeatureFlagReader } from '../flags'
import { createIndexedDbOutboxStorage, CRITICAL_TELEMETRY_EVENTS, TelemetryOutbox } from '../outbox'

interface PostHogLike {
  identify: (id: string) => void
  register: (properties: Record<string, unknown>) => void
  capture: (name: string, properties: object, options?: { uuid?: string }) => unknown
  shutdown: () => Promise<void>
  reset: (options?: { resetDeviceID?: boolean }) => void
}

export const createPostHogTelemetryClient = (
  posthog: PostHogLike,
  outbox = new TelemetryOutbox(createIndexedDbOutboxStorage()),
): TelemetryClient => {
  const sendOutboxItem = async (item: Awaited<ReturnType<typeof outbox.enqueue>>) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false
    return posthog.capture(item.name, item.properties, { uuid: item.id }) !== undefined
  }
  void outbox.drain(sendOutboxItem)

  return {
    identify(identity) {
      posthog.identify(identity.installId)
      posthog.register({ app_session_id: identity.appSessionId })
    },
    capture(name, properties) {
      if (CRITICAL_TELEMETRY_EVENTS.has(name)) {
        void outbox.enqueue(name, { ...properties }).then(() => outbox.drain(sendOutboxItem))
        return
      }
      posthog.capture(name, properties)
    },
    captureException: () => undefined,
    log: () => {},
    addBreadcrumb: () => {},
    startSpan: (_span, run) => run(),
    async flush() {
      await posthog.shutdown()
    },
    async reset() {
      await outbox.clear()
      posthog.reset({ resetDeviceID: true })
      configureFeatureFlagReader()
    },
  }
}
