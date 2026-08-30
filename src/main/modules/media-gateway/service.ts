import { MediaGatewayRegistry } from './registry'
import { MediaGatewayRouter } from './router'
import { MediaGatewayServer } from './server'

export const mediaGatewayRegistry = new MediaGatewayRegistry()
const developmentOrigin = process.env.ELECTRON_RENDERER_URL
  ? new URL(process.env.ELECTRON_RENDERER_URL).origin
  : undefined
const router = new MediaGatewayRouter(mediaGatewayRegistry, {
  isOriginAllowed: (origin) =>
    origin === 'null' || origin === 'file://' || origin === developmentOrigin,
})
const gateway = new MediaGatewayServer(router.handle)

export const startMediaGateway = (): Promise<string> => gateway.start()
export const stopMediaGateway = (): Promise<void> => gateway.stop()
export const getMediaGatewayUrl = (): string | undefined => gateway.url
