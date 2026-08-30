import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const preloadEntry = readFileSync(resolve(process.cwd(), 'src/preload/index.ts'), 'utf8')

describe('preload telemetry entry ordering', () => {
  it('connects Sentry before loading the context bridge and remains fail-open', () => {
    expect(preloadEntry.indexOf("import('@sentry/electron/preload')")).toBeLessThan(
      preloadEntry.indexOf("import('./bootstrap')"),
    )
    expect(preloadEntry).toContain("runtime: 'preload'")
    expect(preloadEntry).toContain('release: __MARCHEN_RELEASE__')
    expect(preloadEntry).toContain('catch (error)')
  })
})
