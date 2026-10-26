import { SubtitleError } from '@marchen/shared/media'
import { MediaSourceError } from '@marchen/shared/media-sources'
import { beforeEach, expect, it, vi } from 'vitest'
import { telemetry } from '../client'
import { reportSubtitleFailure } from '../subtitles'

vi.mock('../client', () => ({ telemetry: { capture: vi.fn(), captureException: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())
it('worker 降级显式上报，诊断不携带字幕正文和本地路径', () => {
  reportSubtitleFailure('renderer', new Error('/Users/private/secret.ass blob:secret 字幕正文'))
  expect(telemetry.capture).toHaveBeenCalledWith('subtitle_failed', { stage: 'renderer', error_code: 'SUBTITLE_RENDERER_FAILED', reason: 'unknown' })
  const [error, context] = vi.mocked(telemetry.captureException).mock.calls[0]
  expect((error as Error).message).not.toContain('secret')
  expect(JSON.stringify(context)).not.toContain('private')
  expect(context?.handled).toBe(true)
})
it('用户取消不计为字幕故障', () => {
  reportSubtitleFailure('resolve', new DOMException('取消', 'AbortError'))
  expect(telemetry.captureException).not.toHaveBeenCalled()
})
it('上报低基数失败原因，不带原始文案', () => {
  reportSubtitleFailure('import', new SubtitleError('timestamp_invalid', 'C:\\Users\\secret.srt 时间无效'))
  expect(telemetry.capture).toHaveBeenCalledWith('subtitle_failed', {
    stage: 'import',
    error_code: 'SUBTITLE_IMPORT_FAILED',
    reason: 'timestamp_invalid',
  })
  const [, context] = vi.mocked(telemetry.captureException).mock.calls[0]
  expect(context?.tags).toEqual({ subtitle_reason: 'timestamp_invalid' })
  expect(context?.fingerprint).toEqual(['subtitle', 'import'])
  expect(JSON.stringify(context)).not.toContain('secret')
})
it('媒体源字幕读取失败归为 read_failed', () => {
  reportSubtitleFailure('resolve', new MediaSourceError('unreachable', '离线'))
  expect(vi.mocked(telemetry.capture).mock.calls[0][1]).toMatchObject({ reason: 'read_failed' })
})
