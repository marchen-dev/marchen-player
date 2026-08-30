import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('cross-runtime Sentry wiring', () => {
  it('assigns runtime and release metadata to Main, Preload and Renderer', () => {
    expect(read('src/main/telemetry/sentry.ts')).toContain("runtime: 'main'")
    expect(read('src/preload/index.ts')).toContain("runtime: 'preload'")
    expect(read('src/renderer/src/services/telemetry/sentry/options.ts')).toContain(
      "runtime: 'renderer'",
    )
    for (const path of [
      'src/main/telemetry/sentry.ts',
      'src/preload/index.ts',
      'src/renderer/src/services/telemetry/sentry/options.ts',
    ]) {
      expect(read(path)).toContain('__MARCHEN_RELEASE__')
    }
  })

  it('keeps Electron native crash capture in the official Main SDK', () => {
    const main = read('src/main/telemetry/sentry.ts')
    expect(main).toContain("from '@sentry/electron/main'")
    expect(main).not.toContain('defaultIntegrations: false')
  })
})
