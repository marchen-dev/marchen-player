import type { PluginOption } from 'vite'
import type { TelemetryBuildMetadata } from './telemetry-metadata'

import { sentryVitePlugin } from '@sentry/vite-plugin'

export interface SentryBuildPluginOptions {
  metadata: TelemetryBuildMetadata
  assets: string | string[]
  mapsToDelete: string | string[]
  authToken?: string
  org?: string
  project?: string
}

export const resolveSentryUploadMode = (options: {
  authToken?: string
  org?: string
  project?: string
}) => {
  const configured = Boolean(options.authToken && options.org && options.project)
  return {
    configured,
    disable: configured ? false : ('disable-upload' as const),
  }
}

/**
 * Debug ID 始终注入；本地无认证时保留 hidden map 供调试但不访问 Sentry。
 * release 的 commits/finalize 由单一协调 job 完成，矩阵构建只上传各自 artifact。
 */
export const createSentryBuildPlugin = (options: SentryBuildPluginOptions): PluginOption => {
  const upload = resolveSentryUploadMode(options)
  if (!upload.configured) {
    console.warn('[sentry] 未配置构建认证，仅注入 Debug ID，跳过 Source Map 上传')
  }
  return sentryVitePlugin({
    authToken: options.authToken,
    org: options.org,
    project: options.project,
    telemetry: false,
    sourcemaps: {
      disable: upload.disable,
      assets: options.assets,
      filesToDeleteAfterUpload: upload.configured ? options.mapsToDelete : undefined,
    },
    release: {
      name: options.metadata.release,
      dist: options.metadata.dist,
      create: false,
      finalize: false,
      setCommits: false,
    },
  })
}
