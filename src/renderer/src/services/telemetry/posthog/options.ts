import { POSTHOG_HOST } from '@renderer/lib/env'

export const createPostHogOptions = () => ({
  api_host: POSTHOG_HOST,
  // api_host 可能是托管反向代理域名（Web 用于规避广告拦截），工具栏与后台链接需固定指向 PostHog 官方地址。
  ui_host: 'https://us.posthog.com',
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
    // 仅弹幕运动层因高频 DOM mutation 屏蔽，其余界面与输入完整录制。
    blockSelector: '[data-telemetry-replay-block]',
    maskAllInputs: false,
    maskTextSelector: null,
  },
})
