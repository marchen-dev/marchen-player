import { MediaGatewayRegistry } from './registry'
import { MediaGatewayRouter } from './router'
import { MediaGatewayServer } from './server'
import { DynamicHlsRequestCoordinator } from './dynamic-hls-coordinator'

export const mediaGatewayRegistry = new MediaGatewayRegistry()
export const dynamicHlsCoordinator = new DynamicHlsRequestCoordinator()
export const dynamicHlsV2Enabled =
  import.meta.env.DEV && import.meta.env.VITE_MEDIA_GATEWAY_V2 === '1'
const developmentOrigin = process.env.ELECTRON_RENDERER_URL
  ? new URL(process.env.ELECTRON_RENDERER_URL).origin
  : undefined
const router = new MediaGatewayRouter(mediaGatewayRegistry, {
  isOriginAllowed: (origin) =>
    origin === 'null' || origin === 'file://' || origin === developmentOrigin,
  dynamicHlsV2Enabled,
  dynamicHlsCoordinator,
})
const gateway = new MediaGatewayServer(router.handle)

export const startMediaGateway = (): Promise<string> => gateway.start()
export const stopMediaGateway = (): Promise<void> => gateway.stop()
export const getMediaGatewayUrl = (): string | undefined => gateway.url
