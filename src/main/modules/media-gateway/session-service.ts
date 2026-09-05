import { sentryGenerationSpanSink } from '@main/telemetry/media-generation-sentry'
import { createCompatibleSessionFactory } from './compatible-session-factory'
import {
  dynamicHlsCoordinator,
  dynamicHlsV2Enabled,
  getMediaGatewayUrl,
  mediaGatewayRegistry,
} from './service'
import { createDynamicHlsSessionFactory } from './dynamic-hls-session-factory'
import { MediaSessionController } from './session-controller'
import type { DynamicHlsLifecycleEvent } from './dynamic-hls-session-lifecycle'

const legacyFactory = createCompatibleSessionFactory(mediaGatewayRegistry)
const dynamicFactory = createDynamicHlsSessionFactory(mediaGatewayRegistry, dynamicHlsCoordinator)
export const mediaSessionController = new MediaSessionController(
  mediaGatewayRegistry,
  getMediaGatewayUrl,
  (input) => {
    const useV2 =
      dynamicHlsV2Enabled &&
      input.request.decision !== undefined &&
      !input.request.legacyTransportReason
    console.info('[media-planner]', {
      executedPlanner: input.request.decision ? 'generalized' : 'legacy',
      transport: useV2 ? 'v2-stable-vod' : 'v1-generation',
      fallbackReason: input.request.legacyTransportReason,
    })
    return useV2 ? dynamicFactory(input) : legacyFactory(input)
  },
  sentryGenerationSpanSink,
)

let shutdownPromise: Promise<void> | undefined

/** window/crash/quit 可能同时到达；同一轮清理只执行一次，完成后允许新窗口再次建立会话。 */
export const shutdownMediaSessions = (
  event: DynamicHlsLifecycleEvent = 'release',
): Promise<void> => {
  shutdownPromise ??= Promise.resolve()
    .then(() => mediaSessionController.releaseAll(event))
    .finally(() => {
      shutdownPromise = undefined
    })
  return shutdownPromise
}
