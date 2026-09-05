/// <reference types="vite/client" />
declare const APP_NAME: string
declare const __MARCHEN_TARGET__: 'electron' | 'web'
declare const __MARCHEN_RELEASE__: string
declare const __MARCHEN_DIST__: string
declare const __MARCHEN_COMMIT__: string
declare const __MARCHEN_VERSION__: string
declare const __MARCHEN_ENVIRONMENT__: 'development' | 'production'

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_POSTHOG_KEY?: string
  readonly VITE_POSTHOG_HOST?: string
  readonly VITE_TELEMETRY_DEBUG?: string
  readonly VITE_FORCE_TRANSCODE_PROFILE?: 'audio' | 'safe' | 'hdr-sdr'
  readonly VITE_FORCE_VIDEO_TRANSCODE?: string
  readonly VITE_MEDIA_COMPAT_PLANNER?: 'legacy' | 'shadow' | 'generalized'
  readonly VITE_MEDIA_FORCE_METHOD?: 'direct-stream' | 'transcode'
  readonly VITE_MEDIA_FORCE_VIDEO_DECODER?: 'auto' | 'hardware' | 'software'
  readonly VITE_MEDIA_FORCE_VIDEO_ENCODER?: 'auto' | 'hardware' | 'software'
  readonly VITE_MEDIA_FORCE_AUDIO_ENCODER?: 'auto' | 'system' | 'software'
  readonly VITE_MEDIA_GATEWAY_V2?: '0' | '1'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
