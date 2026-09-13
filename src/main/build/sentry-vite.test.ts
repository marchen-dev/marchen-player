import { describe, expect, it } from 'vitest'

import { resolveSentryUploadMode } from './sentry-vite'

describe('sentry build upload mode', () => {
  it('keeps Debug ID injection but skips upload without every build credential', () => {
    expect(resolveSentryUploadMode({})).toEqual({
      configured: false,
      disable: 'disable-upload',
    })
    expect(resolveSentryUploadMode({ authToken: 'token', org: 'org' })).toEqual({
      configured: false,
      disable: 'disable-upload',
    })
  })

  it('enables upload only for a complete release configuration', () => {
    expect(resolveSentryUploadMode({ authToken: 'token', org: 'org', project: 'project' })).toEqual(
      { configured: true, disable: false },
    )
  })
})
