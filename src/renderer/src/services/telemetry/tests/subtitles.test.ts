import { SubtitleError } from '@marchen/shared/media'
import { MediaSourceError } from '@marchen/shared/media-sources'
import { PgsSessionError } from '@renderer/services/media/subtitles/pgs/client'
import { beforeEach, expect, it, vi } from 'vitest'
import { telemetry } from '../client'
import { reportBitmapSubtitleSession, reportSubtitleFailure, reportUnsupportedSubtitleTracks, toUnsupportedSubtitleCodec } from '../subtitles'

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
  expect(context?.fingerprint).toEqual(['subtitle', 'import', 'timestamp_invalid'])
  expect(JSON.stringify(context)).not.toContain('secret')
})
it('媒体源字幕读取失败归为 read_failed', () => {
  reportSubtitleFailure('resolve', new MediaSourceError('unreachable', '离线'))
  expect(vi.mocked(telemetry.capture).mock.calls[0][1]).toMatchObject({ reason: 'read_failed' })
})

it('不支持的内嵌轨发产品事件，codec 枚举化，不进 Sentry', () => {
  reportUnsupportedSubtitleTracks({ hash: 'h1', name: '/secret/番剧 第1话.MKV' }, [
    { number: 1, uid: '1', codec: 'S_TEXT/ASS' },
    { number: 2, uid: '2', codec: 'S_HDMV/PGS', unsupportedCode: 'codec' },
    { number: 3, uid: '3', codec: 'S_TEXT/ASS', unsupportedCode: 'encrypted' },
    { number: 4, uid: '4', codec: 'S_FUTURE/XYZ', unsupportedCode: 'codec' },
  ])
  expect(vi.mocked(telemetry.capture).mock.calls).toEqual([
    ['subtitle_track_unsupported', { codec: 'pgs', reason: 'codec', container: 'mkv' }],
    ['subtitle_track_unsupported', { codec: 'ass', reason: 'encrypted', container: 'mkv' }],
    ['subtitle_track_unsupported', { codec: 'other', reason: 'codec', container: 'mkv' }],
  ])
  expect(telemetry.captureException).not.toHaveBeenCalled()
  expect(JSON.stringify(vi.mocked(telemetry.capture).mock.calls)).not.toContain('secret')
})
it('同一媒体同一轨道会话内只统计一次，空 UID 的不同轨道不互相去重', () => {
  const tracks = [
    { number: 1, uid: '', codec: 'S_VOBSUB', unsupportedCode: 'codec' as const },
    { number: 2, uid: '', codec: 'S_VOBSUB', unsupportedCode: 'codec' as const },
  ]
  reportUnsupportedSubtitleTracks({ hash: 'dedupe', name: 'a.webm' }, tracks)
  reportUnsupportedSubtitleTracks({ hash: 'dedupe', name: 'a.webm' }, tracks)
  expect(telemetry.capture).toHaveBeenCalledTimes(2)
  expect(vi.mocked(telemetry.capture).mock.calls[0][1]).toEqual({ codec: 'vobsub', reason: 'codec', container: 'webm' })
  reportUnsupportedSubtitleTracks({ hash: 'other-media', name: 'b.mp4' }, tracks.slice(0, 1))
  expect(vi.mocked(telemetry.capture).mock.calls[2][1]).toMatchObject({ container: 'other' })
})
it('webm 的 WebVTT codec 归入 webvtt', () => {
  expect(toUnsupportedSubtitleCodec('D_WEBVTT/SUBTITLES')).toBe('webvtt')
  expect(toUnsupportedSubtitleCodec('s_hdmv/pgs')).toBe('pgs')
})

it('位图字幕会话失败按会话原因码聚合', () => {
  reportSubtitleFailure('bitmap', new PgsSessionError('index_missing', '/secret/movie.mkv 缺少索引', true))
  expect(telemetry.capture).toHaveBeenCalledWith('subtitle_failed', {
    stage: 'bitmap',
    error_code: 'SUBTITLE_BITMAP_FAILED',
    reason: 'index_missing',
  })
  const [, context] = vi.mocked(telemetry.captureException).mock.calls[0]
  expect(context?.fingerprint).toEqual(['subtitle', 'bitmap', 'index_missing'])
  expect(JSON.stringify(context)).not.toContain('secret')
})

it('位图字幕会话结束时上报汇总，Worker 未回报统计时标记缺失', () => {
  reportBitmapSubtitleSession({
    mode: 'index',
    hdr: true,
    engine: 'native',
    stats: { firstBitmapMs: 160, readBytes: 2_400_000, maxBacktrack: 1, scanUsed: false, blockFailures: 0, decodeFailures: 0, hdr: true },
  })
  expect(telemetry.capture).toHaveBeenLastCalledWith('subtitle_bitmap_session', {
    codec: 'pgs',
    mode: 'index',
    hdr: true,
    engine: 'native',
    first_bitmap_ms: 160,
    read_bytes: 2_400_000,
    max_backtrack: 1,
    block_failures: 0,
    decode_failures: 0,
    stats_missing: false,
  })
  reportBitmapSubtitleSession({ mode: 'scan', hdr: false })
  expect(telemetry.capture).toHaveBeenLastCalledWith('subtitle_bitmap_session', expect.objectContaining({ mode: 'scan', stats_missing: true, read_bytes: undefined }))
  expect(telemetry.captureException).not.toHaveBeenCalled()
})

