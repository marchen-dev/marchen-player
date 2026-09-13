import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTelemetryDefine, resolveTelemetryBuildMetadata } from './telemetry-metadata'

// 发布脚本会注入真实版本和分发信息；每个用例从独立环境开始，再声明自己的覆盖值。
beforeEach(() => {
  for (const key of ['SENTRY_RELEASE', 'MARCHEN_DIST', 'MARCHEN_ENVIRONMENT', 'MARCHEN_COMMIT', 'GITHUB_SHA']) {
    vi.stubEnv(key, undefined)
  }
})

afterEach(() => vi.unstubAllEnvs())

describe('telemetry build metadata', () => {
  it('使用发布脚本注入的版本、提交、分发和环境', () => {
    vi.stubEnv('SENTRY_RELEASE', 'Marchen@1.2.3+release-sha')
    vi.stubEnv('MARCHEN_COMMIT', 'release-sha')
    vi.stubEnv('MARCHEN_DIST', 'web-preview')
    vi.stubEnv('MARCHEN_ENVIRONMENT', 'preview')

    expect(resolveTelemetryBuildMetadata({ target: 'web', version: '1.2.3', mode: 'production' })).toEqual({
      target: 'web', version: '1.2.3', commit: 'release-sha',
      release: 'Marchen@1.2.3+release-sha', dist: 'web-preview', environment: 'preview',
    })
  })

  it('creates a stable web release and dist', () => {
    const metadata = resolveTelemetryBuildMetadata({
      target: 'web',
      version: '1.2.3',
      mode: 'production',
      commit: 'abc123',
    })

    expect(metadata).toEqual({
      target: 'web',
      version: '1.2.3',
      commit: 'abc123',
      environment: 'production',
      release: 'Marchen@1.2.3+abc123',
      dist: 'web',
    })
  })

  it.each([
    ['darwin', 'arm64', 'darwin-arm64'],
    ['darwin', 'x64', 'darwin-x64'],
    ['win32', 'x64', 'win32-x64'],
  ] as const)('creates the %s-%s Electron dist', (platform, arch, dist) => {
    expect(
      resolveTelemetryBuildMetadata({
        target: 'electron',
        version: '1.2.3',
        mode: 'production',
        commit: 'abc123',
        platform,
        arch,
      }).dist,
    ).toBe(dist)
  })

  it('marks development builds and serializes define constants', () => {
    const metadata = resolveTelemetryBuildMetadata({
      target: 'electron',
      version: '1.2.3',
      mode: 'development',
      commit: 'dev',
      platform: 'darwin',
      arch: 'arm64',
    })

    expect(metadata.environment).toBe('development')
    expect(createTelemetryDefine(metadata).__MARCHEN_TARGET__).toBe('"electron"')
    expect(createTelemetryDefine(metadata).__MARCHEN_RELEASE__).toBe('"Marchen@1.2.3+dev"')
  })
})


it('预览上报与生产隔离，开发模式仍保持 development', () => {
  vi.stubEnv('MARCHEN_ENVIRONMENT', 'preview')
  try {
    const input = { target: 'web' as const, version: '1.0.0', commit: 'preview-sha', dist: 'web-preview' }
    expect(resolveTelemetryBuildMetadata({ ...input, mode: 'production' })).toMatchObject({ environment: 'preview', dist: 'web-preview' })
    expect(resolveTelemetryBuildMetadata({ ...input, mode: 'development' }).environment).toBe('development')
  } finally { vi.unstubAllEnvs() }
})
