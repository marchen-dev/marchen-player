import type { MediaEvent, MediaPort, PlaybackMediaSnapshot } from '@marchen/playback-core'
import type { DB_History } from '@renderer/database/schemas/history'
import { Subject } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import { PlaybackHistoryAdapter } from '../history/playback-history-adapter'
import { PlaybackSnapshotAdapter } from '../history/playback-snapshot-adapter'
import { subscribeAutomaticNext } from '../history/playlist'
import { PlayerRuntime } from '../runtime'

const mediaSnapshot = (overrides: Partial<PlaybackMediaSnapshot> = {}): PlaybackMediaSnapshot => ({
  currentTime: 0,
  duration: 100,
  volume: 1,
  muted: false,
  rate: 1,
  paused: false,
  seeking: false,
  ended: false,
  buffered: [],
  ...overrides,
})

const createRuntime = () => {
  const events = new Subject<MediaEvent>()
  let current = mediaSnapshot()
  const media: MediaPort = {
    events$: events,
    setSource: vi.fn(),
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    setRate: vi.fn(),
    getSnapshot: () => current,
    destroy: vi.fn(),
  }
  const runtime = new PlayerRuntime(media)
  runtime.load({ id: 'video', url: 'marchen:///video.mkv' })
  return {
    runtime,
    media,
    emit: (type: MediaEvent['type'], value: PlaybackMediaSnapshot) => {
      current = value
      events.next({ type, sessionId: 1, snapshot: value } as MediaEvent)
    },
  }
}

const historyRecord = (changes: Partial<DB_History> = {}): DB_History => ({
  hash: 'hash',
  path: '/video.mkv',
  progress: 0,
  duration: 100,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...changes,
})

describe('playbackHistoryAdapter', () => {
  it('只有媒体 ready 后才更新最近观看，加载失败不会污染', async () => {
    const { runtime, emit } = createRuntime()
    const markStarted = vi.fn(async () => {})
    const repository = {
      get: vi.fn(async () => ({
        hash: 'hash',
        path: '/video.mkv',
        animeId: 1,
        episodeId: 2,
        progress: 0,
        duration: 0,
        updatedAt: '',
      })),
      update: vi.fn(async () => 1),
    }
    const adapter = new PlaybackHistoryAdapter({
      runtime,
      hash: 'hash',
      repository,
      markStarted,
      markWatched: vi.fn(async () => {}),
    })
    adapter.start()
    await vi.waitFor(() => expect(repository.get).toHaveBeenCalled())
    expect(markStarted).not.toHaveBeenCalled()

    emit('metadata', mediaSnapshot({ duration: 120 }))
    await vi.waitFor(() => expect(markStarted).toHaveBeenCalledWith(1, 2, 'hash'))
    emit('play', mediaSnapshot({ duration: 120, paused: false }))
    expect(markStarted).toHaveBeenCalledOnce()
    adapter.dispose()
  })

  it('恢复未完成进度，并约 2 秒节流保存', async () => {
    const { runtime, media, emit } = createRuntime()
    const update = vi.fn(async () => 1)
    let now = 0
    const adapter = new PlaybackHistoryAdapter({
      runtime,
      hash: 'hash',
      repository: { get: vi.fn(async () => historyRecord({ progress: 40 })), update },
      markWatched: vi.fn(),
      now: () => now,
    })

    adapter.start()
    await vi.waitFor(() => expect(media.seek).toHaveBeenCalledWith(40))
    emit('seeked', mediaSnapshot({ currentTime: 40, paused: true }))
    emit('time-update', mediaSnapshot({ currentTime: 41 }))
    emit('time-update', mediaSnapshot({ currentTime: 42 }))
    expect(update).toHaveBeenCalledTimes(1)
    now = 2100
    emit('time-update', mediaSnapshot({ currentTime: 43 }))
    expect(update).toHaveBeenCalledTimes(2)
    adapter.dispose()
  })

  it('完成度达到 90% 时不恢复进度并只标记一次已看', async () => {
    const { runtime, media, emit } = createRuntime()
    const markWatched = vi.fn(async () => {})
    const record = historyRecord({ progress: 90, animeId: 1, episodeId: 2 })
    const adapter = new PlaybackHistoryAdapter({
      runtime,
      hash: 'hash',
      repository: { get: vi.fn(async () => record), update: vi.fn(async () => 1) },
      markWatched,
    })

    adapter.start()
    await Promise.resolve()
    expect(media.seek).not.toHaveBeenCalled()
    emit('time-update', mediaSnapshot({ currentTime: 91 }))
    emit('ended', mediaSnapshot({ currentTime: 100, ended: true }))
    await vi.waitFor(() => expect(markWatched).toHaveBeenCalledTimes(1))
    adapter.dispose()
  })

  it('ended 将进度收口到 duration', async () => {
    const { runtime, emit } = createRuntime()
    const update = vi.fn(async () => 1)
    const adapter = new PlaybackHistoryAdapter({
      runtime,
      hash: 'hash',
      repository: { get: vi.fn(async () => historyRecord()), update },
      markWatched: vi.fn(),
    })

    adapter.start()
    await Promise.resolve()
    emit('ended', mediaSnapshot({ currentTime: 99, duration: 100, ended: true }))
    await vi.waitFor(() =>
      expect(update).toHaveBeenCalledWith('hash', expect.objectContaining({ progress: 100 })),
    )
    adapter.dispose()
  })
})

describe('playbackSnapshotAdapter', () => {
  it('metadata 与退出时截图，失败不会改变播放流程', async () => {
    const { runtime, emit } = createRuntime()
    const capture = vi
      .fn()
      .mockRejectedValueOnce(new Error('ffmpeg unavailable'))
      .mockResolvedValueOnce('data:image/jpeg;base64,ok')
    const update = vi.fn(async () => 1)
    const onError = vi.fn()
    const source = {
      kind: 'electron-file' as const,
      path: '/video.mkv',
      hash: 'hash',
      name: 'video.mkv',
      size: 1,
    }
    const adapter = new PlaybackSnapshotAdapter({
      runtime,
      hash: 'hash',
      source,
      snapshot: { capture },
      repository: { get: vi.fn(async () => undefined), update },
      onError,
    })

    adapter.start()
    emit('metadata', mediaSnapshot({ duration: 120 }))
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())
    emit('time-update', mediaSnapshot({ currentTime: 32, duration: 120 }))
    adapter.dispose()
    await vi.waitFor(() =>
      expect(update).toHaveBeenCalledWith('hash', { thumbnail: 'data:image/jpeg;base64,ok' }),
    )
    expect(capture).toHaveBeenNthCalledWith(1, { source, time: 60 })
    expect(capture).toHaveBeenNthCalledWith(2, { source, time: 32 })
  })
})

describe('自动下一集', () => {
  it('仅在首次进入 ended 时经 PlaylistPort 切换', () => {
    const { runtime, emit } = createRuntime()
    const next = { id: 'next', name: '下一集', path: '/next.mkv' }
    const play = vi.fn()
    const unsubscribe = subscribeAutomaticNext(runtime, { list: vi.fn(), play }, next)

    emit('ended', mediaSnapshot({ currentTime: 100, ended: true }))
    emit('ended', mediaSnapshot({ currentTime: 100, ended: true }))

    expect(play).toHaveBeenCalledOnce()
    expect(play).toHaveBeenCalledWith(next)
    unsubscribe()
  })
})
