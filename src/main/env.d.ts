/// <reference types="vite/client" />

declare const __MARCHEN_TARGET__: 'electron' | 'web'
declare const __MARCHEN_RELEASE__: string
declare const __MARCHEN_DIST__: string
declare const __MARCHEN_COMMIT__: string
declare const __MARCHEN_VERSION__: string
declare const __MARCHEN_ENVIRONMENT__: 'development' | 'production'

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN: string
  readonly VITE_TELEMETRY_DEBUG?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
