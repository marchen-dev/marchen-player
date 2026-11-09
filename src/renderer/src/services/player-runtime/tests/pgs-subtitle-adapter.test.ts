import type { PlaybackClock, PlaybackMediaSnapshot } from '@marchen/playback-core'
import type { PgsBitmapFrame } from '@renderer/services/media/subtitles/pgs/protocol'
import type { BitmapSessionListener } from '@renderer/services/media/subtitles/pgs/session'
import type { BitmapSubtitleSession } from '../platform/ports'
import { PgsSessionError } from '@renderer/services/media/subtitles/pgs/client'
import { describe, expect, it, vi } from 'vitest'
import { computeSubtitleLayout } from '../subtitles/canvas-layout'
import { PgsSubtitleAdapter } from '../subtitles/pgs-subtitle-adapter'
import { SubtitleRenderers } from '../subtitles/subtitle-renderers'

function fakeCanvas(width = 1280, height = 720) {
  const context = { clearRect: vi.fn(), drawImage: vi.fn(), imageSmoothingEnabled: false, imageSmoothingQuality: 'low' }
  return { canvas: { width, height, getContext: () => context } as unknown as HTMLCanvasElement, context }
}

function fakeClock(initial = 0) {
  const state = { time: initial, paused: false, seeking: false }
  const clock: PlaybackClock = {
    now: () => state.time,
    snapshot: () => ({ paused: state.paused, seeking: state.seeking }) as unknown as PlaybackMediaSnapshot,
  }
  return { clock, state }
}

function fakeSession() {
  let listener: BitmapSessionListener | undefined
  const session = {
    mode: 'index' as const,
    hdr: false,
    update: vi.fn(),
    setListener: vi.fn((next: BitmapSessionListener | undefined) => {
      listener = next
    }),
    close: vi.fn(async () => ({ readBytes: 1, maxBacktrack: 0, scanUsed: false, blockFailures: 0, decodeFailures: 0, hdr: false })),
  }
  return {
    session: session as unknown as BitmapSubtitleSession & typeof session,
    emit: (frames: PgsBitmapFrame[], keep = frames.map((frame) => frame.key), ends: [number, number][] = []) =>
      listener?.frames(frames, keep, ends),
    fail: (error: PgsSessionError) => listener?.error(error),
  }
}

const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> }
const frame = (key: number, start: number, end: number, rects = [{ x: 960, y: 900, width: 200, height: 50 }]): PgsBitmapFrame => ({
  key,
  start,
  end,
  width: 1920,
  height: 1080,
  rects: rects.map((rect) => ({ ...rect, bitmap: bitmap() })),
})

describe('字幕画布布局', () => {
  it('按 contain 规则放进容器，只覆盖视频画面', () => {
    // 21:9 容器放 16:9 视频：左右黑边
    expect(computeSubtitleLayout({ videoWidth: 3840, videoHeight: 2160, containerWidth: 2520, containerHeight: 1080, rotation: 0, pixelRatio: 2 })).toEqual({
      cssWidth: 1920,
      cssHeight: 1080,
      pixelWidth: 3840,
      pixelHeight: 2160,
      rotation: 0,
    })
  })

  it('旋转 90° 时交换宽高再计算', () => {
    const layout = computeSubtitleLayout({ videoWidth: 1920, videoHeight: 1080, containerWidth: 1080, containerHeight: 1920, rotation: 90, pixelRatio: 1 })
    expect(layout).toMatchObject({ cssWidth: 1920, cssHeight: 1080, rotation: 90 })
  })

  it('尺寸未知时不布局', () => {
    expect(computeSubtitleLayout({ videoWidth: 0, videoHeight: 0, containerWidth: 100, containerHeight: 100, rotation: 0, pixelRatio: 1 })).toBeUndefined()
  })
})

describe('位图字幕适配器', () => {
  const setup = (canvasSize?: [number, number]) => {
    const { canvas, context } = fakeCanvas(...(canvasSize ?? []))
    const { clock, state } = fakeClock(10)
    const onError = vi.fn()
    const onClosed = vi.fn()
    let now = 0
    const adapter = new PgsSubtitleAdapter(canvas, clock, onError, onClosed, () => now)
    const { session, emit, fail } = fakeSession()
    const release = vi.fn(() => void session.close())
    adapter.setSession(session, release)
    return { adapter, session, emit, fail, release, context, state, onError, onClosed, advance: (ms: number) => (now += ms) }
  }

  it('换上会话时按当前时间换代次，并按 PGS 画布比例绘制当前帧', () => {
    const { session, emit, context } = setup()
    expect(session.update).toHaveBeenCalledWith(10, true, true)
    emit([frame(1, 9, 12)])
    // 1920×1080 → 1280×720，缩放 2/3
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      640,
      600,
      expect.closeTo(200 * 2 / 3),
      expect.closeTo(50 * 2 / 3),
    )
  })

  it('到了下一句的开始时间就切换，清屏帧只清空画布', () => {
    const { adapter, emit, context, state } = setup()
    emit([frame(1, 9, 11), frame(2, 11, 15, [])])
    expect(context.drawImage).toHaveBeenCalledTimes(1)
    const clears = context.clearRect.mock.calls.length
    state.time = 11.2
    adapter.sync()
    // 切到清屏帧：只清一次画布，不再绘制
    expect(context.drawImage).toHaveBeenCalledTimes(1)
    expect(context.clearRect).toHaveBeenCalledTimes(clears + 1)
    // 同一帧内不重复清屏
    adapter.sync()
    expect(context.clearRect).toHaveBeenCalledTimes(clears + 1)
  })

  it('播放中按间隔报告位置，跳转时丢弃旧位图并换代次', () => {
    const { adapter, session, emit, state, advance } = setup()
    const first = frame(1, 9, 20)
    emit([first])
    session.update.mockClear()
    state.time = 10.1
    adapter.sync()
    expect(session.update).not.toHaveBeenCalled()
    advance(300)
    state.time = 10.3
    adapter.sync()
    expect(session.update).toHaveBeenCalledWith(10.3, true)
    state.time = 600
    adapter.sync()
    expect(session.update).toHaveBeenLastCalledWith(600, true, true)
    expect(first.rects[0].bitmap.close).toHaveBeenCalled()
  })

  it('暂停与恢复立即通知会话', () => {
    const { adapter, session, state } = setup()
    session.update.mockClear()
    state.paused = true
    adapter.sync()
    expect(session.update).toHaveBeenCalledWith(10, false)
  })

  it('只保留会话要求保留的帧，其余位图立即释放', () => {
    const { emit } = setup()
    const old = frame(1, 5, 9)
    emit([old])
    const next = frame(2, 9, 20)
    emit([next], [2])
    expect(old.rects[0].bitmap.close).toHaveBeenCalled()
    expect(next.rects[0].bitmap.close).not.toHaveBeenCalled()
  })

  it('结束时间更新后按新时间判断是否显示', () => {
    const { adapter, emit, context, state } = setup()
    emit([frame(1, 9, Number.POSITIVE_INFINITY)])
    expect(context.drawImage).toHaveBeenCalledTimes(1)
    emit([], [1], [[1, 10.5]])
    state.time = 10.6
    adapter.sync()
    expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, 1280, 720)
  })

  it('裁过黑边的视频：超出画面的字幕向内收', () => {
    // 2.4:1 的画面，PGS 仍是 16:9 画布
    const { emit, context } = setup([1920, 800])
    emit([frame(1, 9, 12, [{ x: 0, y: 1000, width: 100, height: 60 }])])
    // 缩放 1，垂直居中偏移 (800 - 1080) / 2 = -140，y = 860 超出，收到 800 - 60
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 740, 100, 60)
  })

  it('关闭时释放会话、位图与画布，并回报统计', async () => {
    const { adapter, emit, release, session, onClosed } = setup()
    const shown = frame(1, 9, 12)
    emit([shown])
    adapter.close()
    expect(session.setListener).toHaveBeenLastCalledWith(undefined)
    expect(release).toHaveBeenCalled()
    expect(shown.rects[0].bitmap.close).toHaveBeenCalled()
    await vi.waitFor(() => expect(onClosed).toHaveBeenCalledWith(expect.objectContaining({ mode: 'index', stats: expect.objectContaining({ readBytes: 1 }) })))
  })

  it('致命错误关闭字幕并通知宿主，非致命错误忽略', () => {
    const { fail, onError, release } = setup()
    fail(new PgsSessionError('backtrack_exceeded', '超限', false))
    expect(onError).not.toHaveBeenCalled()
    fail(new PgsSessionError('read_failed', '读取失败', true))
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'read_failed' }))
    expect(release).toHaveBeenCalled()
  })
})

describe('文本与位图字幕互斥', () => {
  it('换上一方时关闭另一方，关闭与偏移同时作用于两者', () => {
    const text = { setTrack: vi.fn(() => true), close: vi.fn(), setTimeOffset: vi.fn(), setFontScale: vi.fn(), resize: vi.fn(), sync: vi.fn(), dispose: vi.fn() }
    const bitmap = { setSession: vi.fn(() => true), close: vi.fn(), setTimeOffset: vi.fn(), resize: vi.fn(), sync: vi.fn(), dispose: vi.fn() }
    const renderers = new SubtitleRenderers(text as never, bitmap as never)
    renderers.setBitmapTrack({} as never)
    expect(text.close).toHaveBeenCalledTimes(1)
    renderers.setTrack('blob:x')
    expect(bitmap.close).toHaveBeenCalledTimes(1)
    renderers.setTimeOffset(2)
    expect(text.setTimeOffset).toHaveBeenCalledWith(2)
    expect(bitmap.setTimeOffset).toHaveBeenCalledWith(2)
    renderers.setFontScale(120)
    expect(text.setFontScale).toHaveBeenCalledWith(120)
    renderers.close()
    expect(text.close).toHaveBeenCalledTimes(2)
    expect(bitmap.close).toHaveBeenCalledTimes(2)
  })
})
