import { beforeEach, expect, it, vi } from 'vitest'
import { telemetry } from '../client'
import { reportSubtitleFailure } from '../subtitles'

vi.mock('../client', () => ({ telemetry: { capture: vi.fn(), captureException: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())
it('worker 降级显式上报，诊断不携带字幕正文和本地路径', () => {
  reportSubtitleFailure('renderer', new Error('/Users/private/secret.ass blob:secret 字幕正文'))
  expect(telemetry.capture).toHaveBeenCalledWith('subtitle_failed', { stage: 'renderer', error_code: 'SUBTITLE_RENDERER_FAILED' })
  const [error, context] = vi.mocked(telemetry.captureException).mock.calls[0]
  expect((error as Error).message).not.toContain('secret')
  expect(JSON.stringify(context)).not.toContain('private')
  expect(context?.handled).toBe(true)
})
it('用户取消不计为字幕故障', () => {
  reportSubtitleFailure('resolve', new DOMException('取消', 'AbortError'))
  expect(telemetry.captureException).not.toHaveBeenCalled()
})
