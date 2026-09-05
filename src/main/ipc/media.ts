import type {
  AcknowledgeMediaSessionRequest,
  GetMediaSessionRequest,
  MediaSessionIpcResult,
  PrepareDirectMediaSessionRequest,
  PrepareMediaSessionRequest,
  ProbeMediaRequest,
  ReleaseMediaSessionRequest,
  SeekMediaSessionRequest,
} from '@marchen/shared/media'
import { supportsToneMapToSdr } from '@main/modules/ffmpeg/runtime'
import { decodableCodecNamesForRuntime } from '@main/modules/ffmpeg/codec-catalog'
import { getFfmpegMediaTools, getFfmpegRuntime } from '@main/modules/ffmpeg/service'
import { getMediaGatewayUrl } from '@main/modules/media-gateway/service'
import { MediaSessionControllerError } from '@main/modules/media-gateway/session-controller'
import { mediaSessionController } from '@main/modules/media-gateway/session-service'
import { runPreparationStage } from '@main/modules/media-gateway/preparation'
import { toMediaCompatError } from '@main/modules/media-gateway/errors'
import { reportMainOperationalError } from '@main/telemetry/operational-errors'
import { tipc } from '@marchen/electron-ipc/main'

const t = tipc.create()

const result = async <T>(
  area: 'ffmpeg' | 'gateway' | 'ipc',
  operation: string,
  action: () => T | Promise<T>,
): Promise<MediaSessionIpcResult<T>> => {
  try {
    return { ok: true, data: await action() }
  } catch (error) {
    if (error instanceof MediaSessionControllerError) {
      reportMainOperationalError(area, operation, error.detail, error.detail.recoverable)
      return { ok: false, error: error.detail }
    }
    const detail = toMediaCompatError(error, {
      code: 'unknown',
      message: error instanceof Error ? error.message : '媒体会话操作失败',
      recoverable: true,
    })
    reportMainOperationalError(area, operation, detail, detail.recoverable)
    return { ok: false, error: detail }
  }
}

export const mediaGroup = {
  probe: t.procedure
    .input<ProbeMediaRequest>()
    .action(({ input }) =>
      result('ffmpeg', 'probe', () =>
        mediaSessionController.preparation(input.requestId ?? crypto.randomUUID(), (signal) =>
          runPreparationStage(
            'probe',
            async (child) =>
              (await getFfmpegMediaTools()).probe(input.source.path, input.source.hash, child),
            { signal },
          ),
        ),
      ),
    ),
  cancelPreparation: t.procedure
    .input<{ requestId: string }>()
    .action(({ input }) =>
      result('gateway', 'cancel_prepare', () =>
        mediaSessionController.cancelPreparation(input.requestId),
      ),
    ),
  capabilities: t.procedure.action(() =>
    result('ffmpeg', 'capabilities', async () => {
      const runtime = await getFfmpegRuntime()
      const runtimeReady = Boolean(runtime)
      const gatewayReady = Boolean(getMediaGatewayUrl())
      const sessionApiReady = true
      return {
        runtimeReady,
        gatewayReady,
        sessionApiReady,
        available: runtimeReady && gatewayReady && sessionApiReady,
        toneMapToSdr: supportsToneMapToSdr(runtime.capabilities),
        target: runtime.paths.target,
        release: runtime.metadata.ffmpegRelease,
        negotiation: {
          available: runtimeReady && gatewayReady && sessionApiReady,
          decodableCodecs: decodableCodecNamesForRuntime(runtime.capabilities.decoders),
          h264Output:
            runtime.capabilities.encoders.has('libx264') ||
            [...runtime.capabilities.encoders].some((name) => name.startsWith('h264_')),
          aacOutput:
            runtime.capabilities.encoders.has('aac') || runtime.capabilities.encoders.has('aac_at'),
          fmp4HlsOutput:
            runtime.capabilities.muxers.has('hls') && runtime.capabilities.muxers.has('mp4'),
          toneMapToSdr: supportsToneMapToSdr(runtime.capabilities),
        },
      }
    }),
  ),
  prepareDirect: t.procedure
    .input<PrepareDirectMediaSessionRequest>()
    .action(({ input }) =>
      result('gateway', 'prepare_direct', () => mediaSessionController.createDirect(input)),
    ),
  prepare: t.procedure
    .input<PrepareMediaSessionRequest>()
    .action(({ input }) =>
      result('gateway', 'prepare', () => mediaSessionController.create(input)),
    ),
  get: t.procedure
    .input<GetMediaSessionRequest>()
    .action(({ input }) =>
      result('gateway', 'get', () => mediaSessionController.get(input.sessionId)),
    ),
  seek: t.procedure
    .input<SeekMediaSessionRequest>()
    .action(({ input }) => result('gateway', 'seek', () => mediaSessionController.seek(input))),
  acknowledge: t.procedure
    .input<AcknowledgeMediaSessionRequest>()
    .action(({ input }) =>
      result('gateway', 'acknowledge', () => mediaSessionController.acknowledge(input)),
    ),
  release: t.procedure
    .input<ReleaseMediaSessionRequest>()
    .action(({ input }) =>
      result('gateway', 'release', () => mediaSessionController.release(input.sessionId)),
    ),
  reportPlayback: t.procedure
    .input<{ sessionId: string; position: number }>()
    .action(({ input }) =>
      result('gateway', 'report_playback', () =>
        mediaSessionController.reportPlayback(input.sessionId, input.position),
      ),
    ),
}
