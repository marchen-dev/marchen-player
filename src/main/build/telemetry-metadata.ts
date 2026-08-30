import { execFileSync } from 'node:child_process'

export type MarchenTarget = 'electron' | 'web'

export interface TelemetryBuildMetadata {
  target: MarchenTarget
  release: string
  dist: string
  commit: string
  version: string
  environment: 'development' | 'production'
}

interface ResolveTelemetryBuildMetadataOptions {
  target: MarchenTarget
  version: string
  mode: string
  commit?: string
  dist?: string
  platform?: NodeJS.Platform
  arch?: string
}

const readGitCommit = (): string => {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'unknown'
  }
}

export const resolveTelemetryBuildMetadata = (
  options: ResolveTelemetryBuildMetadataOptions,
): TelemetryBuildMetadata => {
  const commit = options.commit || process.env.MARCHEN_COMMIT || process.env.GITHUB_SHA || readGitCommit()
  const environment = options.mode === 'development' ? 'development' : 'production'
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const defaultDist = options.target === 'web' ? 'web' : `${platform}-${arch}`

  return {
    target: options.target,
    version: options.version,
    commit,
    environment,
    release: process.env.SENTRY_RELEASE || `Marchen@${options.version}+${commit}`,
    dist: options.dist || process.env.MARCHEN_DIST || defaultDist,
  }
}

export const createTelemetryDefine = (
  metadata: TelemetryBuildMetadata,
): Record<string, string> => ({
  __MARCHEN_TARGET__: JSON.stringify(metadata.target),
  __MARCHEN_RELEASE__: JSON.stringify(metadata.release),
  __MARCHEN_DIST__: JSON.stringify(metadata.dist),
  __MARCHEN_COMMIT__: JSON.stringify(metadata.commit),
  __MARCHEN_VERSION__: JSON.stringify(metadata.version),
  __MARCHEN_ENVIRONMENT__: JSON.stringify(metadata.environment),
})
