import type {
  ElectronDurableMediaSource,
  MediaSessionIpcResult,
  MediaSessionSnapshot,
  PlaybackSourceLease,
} from '@marchen/shared/media'
import { MARCHEN_PROTOCOL_PREFIX } from '@marchen/shared/constants/protocol'
import { createPlaybackSourceLease } from './playback-lease'

export interface ElectronDirectLeaseOptions {
  gatewayEnabled: boolean
  prepareGateway: (
    source: ElectronDurableMediaSource,
  ) => Promise<MediaSessionIpcResult<MediaSessionSnapshot> | undefined>
  releaseGateway: (sessionId: string) => void
}

const protocolLease = (source: ElectronDurableMediaSource): PlaybackSourceLease =>
  createPlaybackSourceLease(
    {
      id: createId(),
      logicalSourceId: source.hash,
      mode: 'direct',
      transport: 'custom-protocol',
      url: source.path.startsWith(MARCHEN_PROTOCOL_PREFIX)
        ? source.path
        : `${MARCHEN_PROTOCOL_PREFIX}${source.path}`,
      timeline: { originalDuration: 0, offset: 0, calibrated: false },
    },
    () => {},
  )

export const prepareElectronDirectLease = async (
  source: ElectronDurableMediaSource,
  options: ElectronDirectLeaseOptions,
): Promise<PlaybackSourceLease> => {
  if (options.gatewayEnabled) {
    try {
      const response = await options.prepareGateway(source)
      const descriptor = response?.ok ? response.data.lease : undefined
      if (descriptor?.transport === 'http-range' && descriptor.sessionId) {
        return createPlaybackSourceLease(descriptor, () =>
          options.releaseGateway(descriptor.sessionId!),
        )
      }
    } catch {}
  }
  return protocolLease(source)
}

const createId = () =>
  globalThis.crypto?.randomUUID?.() ?? `player-source-${Date.now()}-${Math.random()}`
