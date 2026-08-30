import { describe, expect, it } from 'vitest'

import { FfmpegExecutionError } from '../modules/ffmpeg/executor'
import { getMainErrorDiagnosticContext } from './diagnostics'

describe('main operational error diagnostics', () => {
  it('keeps path, command and bounded stderr in Sentry-only context', () => {
    const error = new FfmpegExecutionError('failed', {
      failure: 'exit',
      durationMs: 123,
      executable: '/private/ffmpeg',
      arguments: ['-i', '/private/anime.mkv', '-f', 'hls'],
      inputs: ['/private/anime.mkv'],
      stderr: 'x'.repeat(40_000),
    })

    expect(getMainErrorDiagnosticContext(error)).toMatchObject({
      command: '/private/ffmpeg -i /private/anime.mkv -f hls',
      input_paths: ['/private/anime.mkv'],
      duration_ms: 123,
    })
    expect(String(getMainErrorDiagnosticContext(error).stderr).length).toBeLessThan(33_000)
  })
})
