import type { GpuAcceleration } from '@marchen/shared/constants/telemetry'
import type { SubtitleFailureReason } from '@marchen/shared/media'
import type { MediaSourceErrorCode, MediaSourceKind } from '@marchen/shared/media-sources'
import type { ApiRequestResult, ApiRouteChange } from '@renderer/request/api-route-client'

export type TelemetryRuntime = 'main' | 'preload' | 'renderer'
export type TelemetryTarget = 'electron' | 'web'

export interface CommonTelemetryProperties {
  release: string
  dist: string
  version: string
  commit: string
  environment: 'development' | 'preview' | 'production'
  app_target: TelemetryTarget
  runtime: TelemetryRuntime
  platform: string
  arch: string
  package_type?: string
  install_id?: string
  app_session_id: string
  playback_session_id?: string
}

export type LoadMode = 'complete' | 'play_first'

/** 视频的实际来源类型，对应 HISTORY source.kind */
export type MediaKind = 'local' | 'web_file' | 'remote_url' | 'media_source'
/** 加载流程中可被跳过或取消的步骤；优先播放的后台阶段沿用 matching / loading_danmaku */
export type LoadingExitStep =
  'hashing' | 'matching' | 'waiting_user' | 'match_failed' | 'loading_danmaku'

export interface TelemetryEventMap {
  api_route_changed: ApiRouteChange
  api_request_completed: ApiRequestResult
  download_add_result: {
    input: 'http' | 'magnet' | 'torrent'
    stage: 'metadata' | 'create'
    result: 'success' | 'failed'
    duration_ms: number
  }
  download_state_changed: {
    kind: 'http' | 'bt'
    state: 'created' | 'completed' | 'failed' | 'selection_changed'
    selected_count: number
    total_bytes: number
    verified_bytes: number
    elapsed_ms: number
    error_code?: 'download_failed'
  }
  download_action_result: {
    kind: 'http' | 'bt'
    action: 'pause' | 'resume' | 'retry' | 'remove' | 'play' | 'open_folder' | 'selection'
    result: 'success' | 'failed'
    duration_ms: number
    delete_files?: boolean
  }
  download_progress_stalled: {
    kind: 'http' | 'bt'
    stalled_ms: number
    received_bytes: number
    verified_bytes: number
    peers: number
    hash_failures: number
  }
  remote_import_result: {
    result: 'success' | 'failed' | 'cancelled'
    duration_ms: number
    fingerprint: boolean
    restoring: boolean
    received_bytes: number
    error_code?: 'remote_import_failed'
  }
  /** 媒体源的添加、编辑与重新登录结果；地址、账号等高基数值不进属性 */
  media_source_saved: {
    provider: MediaSourceKind
    action: 'add' | 'update' | 'relogin'
    result: 'success' | 'failed'
    error_code?: MediaSourceErrorCode
  }
  media_source_browse_failed: {
    provider: MediaSourceKind
    error_code: MediaSourceErrorCode
  }
  /** 媒体源条目打开结果（租约 + 识别前缀），与 remote_import_result 同口径 */
  media_source_open_result: {
    provider: MediaSourceKind
    result: 'success' | 'failed' | 'cancelled'
    duration_ms: number
    fingerprint: boolean
    restoring: boolean
    received_bytes: number
    error_code?: MediaSourceErrorCode
  }
  app_session_started: { launch_source?: string; gpu_acceleration?: GpuAcceleration }
  app_session_ended: { duration_ms: number; reason: 'quit' | 'reload' | 'reset' | 'unknown' }
  page_viewed: { route: string; previous_route?: string }
  feature_used: { feature: string; action: string; value?: string | number | boolean }
  video_import_started: {
    operation_id: string
    source:
      | 'click'
      | 'drop'
      | 'library'
      | 'history'
      | 'association'
      | 'remote_url'
      | 'download'
      | 'media_source'
  }
  video_import_completed: {
    operation_id: string
    /** complete：等弹幕就绪再播放；play_first：先开播、后台接入弹幕 */
    load_mode: LoadMode
    duration_ms: number
    /**
     * 视频实际来自哪里，与入口 source 正交：从播放记录续播时 source 为 history，
     * 靠它区分本地文件、URL 直链和媒体源，按来源对比开播与卡顿
     */
    media_kind?: MediaKind
    container?: string
    duration_bucket?: string
    /** 停留在 hashing 步骤的耗时；远程来源需要读取识别前缀，用来区分导入慢在哪 */
    hash_ms?: number
  }
  video_import_failed: { operation_id: string; error_code: string; duration_ms: number }
  danmaku_match_completed: {
    operation_id: string
    load_mode: LoadMode
    /** unmatched：后台匹配无精确结果；failed：后台匹配接口失败（仅优先播放模式产生） */
    result: 'automatic' | 'manual' | 'none' | 'cancelled' | 'unmatched' | 'failed'
    duration_ms: number
    comment_count?: number
    /**
     * 仅 result 为 none（用户跳过弹幕）或 cancelled 时出现：离开时所处的步骤。
     * matching 多为等不及，waiting_user 多为候选不合适，match_failed 为接口失败后放弃
     */
    skip_from_step?: LoadingExitStep
    /** 出现过非精确匹配候选时的候选数；0 通常说明弹弹play 不认识这个视频 */
    candidate_count?: number
    /** 弹幕匹配的来源：auto 自动匹配、history 播放记录、manual 用户选择 */
    match_origin?: 'auto' | 'history' | 'manual'
    /** 以下为各步骤停留耗时，用来把接口耗时与用户犹豫时间分开；未经过该步骤时不出现 */
    matching_ms?: number
    user_wait_ms?: number
    danmaku_load_ms?: number
  }
  /** 加载流程进入可播放状态；优先播放模式下早于 danmaku_match_completed */
  playback_ready: {
    operation_id: string
    load_mode: LoadMode
    duration_ms: number
    has_danmaku: boolean
  }
  media_prepare_completed: {
    operation_id: string
    attempt_id: string
    reason: string
    duration_ms: number
    engine?: 'native' | 'compat'
    backend?: string
    container?: string
    video_codec?: string
    audio_codec?: string
  }
  playback_engine_changed: {
    operation_id: string
    attempt_id?: string
    from?: 'native' | 'compat'
    to: 'native' | 'compat'
    trigger: 'settings' | 'automatic' | 'retry' | 'restore' | 'audio-track'
    result: 'success' | 'failed' | 'cancelled'
    requested_preference?: 'auto' | 'native' | 'compat'
    committed_preference: 'auto' | 'native' | 'compat'
  }
  playback_seek_completed: {
    operation_id: string
    attempt_id?: string
    engine?: 'native' | 'compat'
    target_time: number
    duration_ms: number
    result: 'success' | 'failed' | 'cancelled'
  }
  playback_started: {
    operation_id: string
    attempt_id: string
    engine?: 'native' | 'compat'
    backend?: string
    time_to_first_frame_ms: number
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
    rendered_frames?: number
    dropped_frames?: number
    linear_memory_peak_bytes?: number
    video_queue_peak?: number
    audio_ahead_peak_s?: number
  }
  subtitle_failed: {
    stage: 'resolve' | 'renderer' | 'catalog' | 'import'
    error_code: string
    reason: SubtitleFailureReason
  }
  playback_failed: {
    operation_id: string
    attempt_id?: string
    engine?: 'native' | 'compat'
    error_code: string
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
  /** 仅放稳定的低基数枚举值，便于在 Sentry 中按维度筛选 */
  tags?: Record<string, string>
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
