import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('postHog build targets', () => {
  it('uses the self-contained Electron entry and the default Web entry', () => {
    const electron = read(
      'src/renderer/src/services/telemetry/posthog/targets/electron.ts',
    )
    const web = read('src/renderer/src/services/telemetry/posthog/targets/web.ts')

    expect(electron).toContain("posthog-js/dist/module.full.no-external")
    expect(electron).toContain('disable_external_dependency_loading: true')
    expect(web).toContain("from 'posthog-js'")
    expect(web).not.toContain('module.full.no-external')
  })
})
