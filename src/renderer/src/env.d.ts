/// <reference types="vite/client" />
declare const APP_NAME: string
declare const __MARCHEN_TARGET__: 'electron' | 'web'
declare const __MARCHEN_RELEASE__: string
declare const __MARCHEN_DIST__: string
declare const __MARCHEN_COMMIT__: string
declare const __MARCHEN_VERSION__: string
declare const __MARCHEN_ENVIRONMENT__: 'development' | 'preview' | 'production'

interface ImportMetaEnv {
  readonly VITE_API_CLOUDFLARE_URL: string
  readonly VITE_API_EDGEONE_URL: string
  readonly VITE_API_SIGN_KID?: string
  readonly VITE_API_SIGN_KEY?: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_POSTHOG_KEY?: string
  readonly VITE_POSTHOG_HOST?: string
  readonly VITE_TELEMETRY_DEBUG?: string
  /** 翻译引擎与模型的存储桶基址；未配置时弹幕翻译不可用 */
  readonly VITE_TRANSLATION_ASSETS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
