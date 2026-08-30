import { sentryGenerationSpanSink } from '@main/telemetry/media-generation-sentry'
import { createCompatibleSessionFactory } from './compatible-session-factory'
import { getMediaGatewayUrl, mediaGatewayRegistry } from './service'
import { MediaSessionController } from './session-controller'

export const mediaSessionController = new MediaSessionController(
  mediaGatewayRegistry,
  getMediaGatewayUrl,
  createCompatibleSessionFactory(mediaGatewayRegistry),
  sentryGenerationSpanSink,
)

let shutdownPromise: Promise<void> | undefined

/** window/crash/quit 可能同时到达；同一轮清理只执行一次，完成后允许新窗口再次建立会话。 */
export const shutdownMediaSessions = (): Promise<void> => {
  shutdownPromise ??= Promise.resolve()
    .then(() => mediaSessionController.releaseAll())
    .finally(() => {
      shutdownPromise = undefined
    })
  return shutdownPromise
}
