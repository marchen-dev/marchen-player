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
import { getFfmpegMediaTools, getFfmpegRuntime } from '@main/modules/ffmpeg/service'
import { getMediaGatewayUrl } from '@main/modules/media-gateway/service'
import { MediaSessionControllerError } from '@main/modules/media-gateway/session-controller'
import { mediaSessionController } from '@main/modules/media-gateway/session-service'
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
    reportMainOperationalError(area, operation, error)
    return {
      ok: false,
      error: {
        code: 'unknown',
        message: error instanceof Error ? error.message : '媒体会话操作失败',
        recoverable: true,
      },
    }
  }
}

export const mediaGroup = {
  probe: t.procedure
    .input<ProbeMediaRequest>()
    .action(({ input }) =>
      result('ffmpeg', 'probe', () =>
        getFfmpegMediaTools().then((tools) => tools.probe(input.source.path, input.source.hash)),
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
}
