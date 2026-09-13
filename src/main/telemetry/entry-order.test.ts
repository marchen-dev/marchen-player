import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const mainEntry = readFileSync(resolve(process.cwd(), 'src/main/index.ts'), 'utf8')

describe('main telemetry entry ordering', () => {
  it('selects the development appData directory before telemetry is loaded', () => {
    expect(mainEntry.indexOf("app.setPath('appData'")).toBeLessThan(
      mainEntry.indexOf("import('./telemetry/sentry')"),
    )
  })

  it('loads application bootstrap dynamically after telemetry initialization', () => {
    expect(mainEntry).not.toMatch(/from ['"]\.\/bootstrap['"]/)
    expect(mainEntry.indexOf("import('./telemetry/sentry')")).toBeLessThan(
      mainEntry.indexOf("import('./bootstrap')"),
    )
    expect(mainEntry).toContain('catch (error)')
    expect(mainEntry).toContain("import './register-schemes'")
  })
})
