import { POSTHOG_HOST } from '@renderer/lib/env'

export const createPostHogOptions = () => ({
  api_host: POSTHOG_HOST,
  defaults: '2026-08-30' as const,
  autocapture: true,
  capture_pageview: false,
  capture_pageleave: true,
  capture_performance: true,
  capture_exceptions: false,
  disable_session_recording: false,
  persistence: 'localStorage' as const,
  person_profiles: 'always' as const,
  mask_all_text: false,
  mask_all_element_attributes: false,
  session_recording: {
    blockSelector: '[data-telemetry-replay-block]',
    maskAllInputs: false,
    maskTextSelector: null,
  },
})
