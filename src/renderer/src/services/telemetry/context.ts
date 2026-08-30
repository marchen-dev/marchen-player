import type { CommonTelemetryProperties, TelemetryRuntime } from './contracts'

import { nanoid } from 'nanoid'

export interface TelemetryBuildInfo {
  target: 'electron' | 'web'
  release: string
  dist: string
  commit: string
  version: string
  environment: 'development' | 'production'
}

export const getTelemetryBuildInfo = (): TelemetryBuildInfo => ({
  target: typeof __MARCHEN_TARGET__ === 'undefined' ? 'web' : __MARCHEN_TARGET__,
  release: typeof __MARCHEN_RELEASE__ === 'undefined' ? 'development' : __MARCHEN_RELEASE__,
  dist: typeof __MARCHEN_DIST__ === 'undefined' ? 'development' : __MARCHEN_DIST__,
  commit: typeof __MARCHEN_COMMIT__ === 'undefined' ? 'unknown' : __MARCHEN_COMMIT__,
  version: typeof __MARCHEN_VERSION__ === 'undefined' ? '0.0.0' : __MARCHEN_VERSION__,
  environment:
    typeof __MARCHEN_ENVIRONMENT__ === 'undefined' ? 'development' : __MARCHEN_ENVIRONMENT__,
})

export const createTelemetryContextStore = (options: {
  runtime: TelemetryRuntime
  platform: string
  arch: string
  build?: TelemetryBuildInfo
  appSessionId?: string
}) => {
  const build = options.build ?? getTelemetryBuildInfo()
  const appSessionId = options.appSessionId ?? nanoid()
  let installId: string | undefined
  let playbackSessionId: string | undefined

  return {
    appSessionId,
    setInstallId(value: string | undefined) {
      installId = value
    },
    setPlaybackSessionId(value: string | undefined) {
      playbackSessionId = value
    },
    get(): CommonTelemetryProperties {
      return {
        release: build.release,
        dist: build.dist,
        version: build.version,
        commit: build.commit,
        environment: build.environment,
        app_target: build.target,
        runtime: options.runtime,
        platform: options.platform,
        arch: options.arch,
        install_id: installId,
        app_session_id: appSessionId,
        playback_session_id: playbackSessionId,
      }
    },
  }
}

export type TelemetryContextStore = ReturnType<typeof createTelemetryContextStore>
