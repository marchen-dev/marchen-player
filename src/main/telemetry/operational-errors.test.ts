import { describe, expect, it } from 'vitest'

import { getMainErrorDiagnosticContext } from './diagnostics'

describe('main operational error diagnostics', () => {
  it('keeps path, command and bounded stderr in Sentry-only context', () => {
    const error = Object.assign(new Error('failed'), {
      failure: 'exit',
      durationMs: 123,
      executable: '/private/helper',
      arguments: ['--input', '/private/anime.mkv'],
      inputs: ['/private/anime.mkv'],
      stderr: 'x'.repeat(40_000),
    })

    expect(getMainErrorDiagnosticContext(error)).toMatchObject({
      command: '/private/helper --input /private/anime.mkv',
      input_paths: ['/private/anime.mkv'],
      duration_ms: 123,
    })
    expect(String(getMainErrorDiagnosticContext(error).stderr).length).toBeLessThan(33_000)
  })
})
