import type { TelemetryClient } from './contracts'
import { configureTelemetry, telemetry } from './client'
import { createTelemetryContextStore } from './context'
import { getRendererTelemetryIdentity } from './identity'
import { configurePlaybackSessionContext } from './playback-session'

export const startTelemetrySession = async (options: {
  client: TelemetryClient
  launchSource?: string
}) => {
  const identity = await getRendererTelemetryIdentity()
  const context = createTelemetryContextStore({
    runtime: 'renderer',
    platform: identity.platform,
    arch: identity.arch,
    appSessionId: identity.appSessionId,
  })
  const startedAt = Date.now()
  let ended = false

  context.setInstallId(identity.installId)
  configureTelemetry({ client: options.client, contextProvider: context.get })
  configurePlaybackSessionContext(context.setPlaybackSessionId)
  telemetry.identify({ installId: identity.installId, appSessionId: context.appSessionId })
  telemetry.capture('app_session_started', { launch_source: options.launchSource })

  const end = async (
    reason: 'quit' | 'reload' | 'reset' | 'unknown' = 'unknown',
  ): Promise<void> => {
    if (ended) return
    ended = true
    telemetry.capture('app_session_ended', { duration_ms: Date.now() - startedAt, reason })
    await telemetry.flush()
  }

  const onPageHide = () => void end('quit')
  window.addEventListener('pagehide', onPageHide, { once: true })

  return {
    appSessionId: context.appSessionId,
    installId: identity.installId,
    setPlaybackSessionId: context.setPlaybackSessionId,
    end,
    dispose() {
      window.removeEventListener('pagehide', onPageHide)
      configurePlaybackSessionContext()
    },
  }
}

export type TelemetrySession = Awaited<ReturnType<typeof startTelemetrySession>>
