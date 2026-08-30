export type TelemetryRuntime = 'main' | 'preload' | 'renderer'
export type TelemetryTarget = 'electron' | 'web'
export type PlaybackMode = 'direct' | 'remux' | 'transcode-audio' | 'transcode-video'

export interface CommonTelemetryProperties {
  release: string
  dist: string
  version: string
  commit: string
  environment: 'development' | 'production'
  app_target: TelemetryTarget
  runtime: TelemetryRuntime
  platform: string
  arch: string
  install_id?: string
  app_session_id: string
  playback_session_id?: string
}

export interface TelemetryEventMap {
  app_session_started: { launch_source?: string }
  app_session_ended: { duration_ms: number; reason: 'quit' | 'reload' | 'reset' | 'unknown' }
  page_viewed: { route: string; previous_route?: string }
  feature_used: { feature: string; action: string; value?: string | number | boolean }
  video_import_started: {
    operation_id: string
    source: 'click' | 'drop' | 'library' | 'association'
  }
  video_import_completed: {
    operation_id: string
    duration_ms: number
    container?: string
    duration_bucket?: string
  }
  video_import_failed: { operation_id: string; error_code: string; duration_ms: number }
  danmaku_match_completed: {
    operation_id: string
    result: 'automatic' | 'manual' | 'none' | 'cancelled'
    duration_ms: number
    comment_count?: number
  }
  media_prepare_completed: {
    operation_id: string
    attempt_id: string
    mode: PlaybackMode
    reason: string
    duration_ms: number
    generation?: number
    container?: string
    video_codec?: string
    audio_codec?: string
  }
  compat_fallback_triggered: {
    operation_id: string
    attempt_id: string
    from: PlaybackMode
    to: PlaybackMode
    reason: string
  }
  playback_started: {
    operation_id: string
    attempt_id: string
    mode: PlaybackMode
    time_to_first_frame_ms: number
    generation?: number
  }
  playback_stalled: {
    operation_id: string
    stall_count: number
    stall_duration_ms: number
    recovered: boolean
  }
  playback_ended: {
    operation_id: string
    reason: 'ended' | 'user_exit' | 'source_changed' | 'cancelled'
    watched_ms: number
    stall_count: number
    stall_duration_ms: number
  }
  playback_failed: {
    operation_id: string
    error_code: string
    mode?: PlaybackMode
    generation?: number
  }
}

export type TelemetryEventName = keyof TelemetryEventMap

export interface TelemetryIdentity {
  installId: string
  appSessionId: string
}

export interface ErrorContext {
  handled?: boolean
  mechanism?: string
  level?: 'warning' | 'error' | 'fatal'
  errorCode?: string
  fingerprint?: string[]
  contexts?: Record<string, unknown>
}

export interface TelemetryBreadcrumb {
  category: string
  message: string
  level?: 'debug' | 'info' | 'warning' | 'error'
  data?: Record<string, unknown>
}

export interface TelemetryLog {
  level: 'debug' | 'info' | 'warning' | 'error'
  message: string
  data?: Record<string, unknown>
}

export interface TelemetrySpan {
  name: string
  op: string
  attributes?: Record<string, string | number | boolean>
}

export interface TelemetryClient {
  identify: (identity: TelemetryIdentity) => void
  capture: <E extends TelemetryEventName>(
    name: E,
    properties: TelemetryEventMap[E] & CommonTelemetryProperties,
  ) => void
  captureException: (error: unknown, context?: ErrorContext) => string | undefined
  log: (entry: TelemetryLog) => void
  addBreadcrumb: (breadcrumb: TelemetryBreadcrumb) => void
  startSpan: <T>(span: TelemetrySpan, run: () => T | Promise<T>) => T | Promise<T>
  flush: () => Promise<void>
  reset: () => Promise<void>
}
