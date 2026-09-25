import type {
  CommentsData,
  DanmakuEntry,
  LoadingState,
  MatchResult,
  ReadyState,
} from '../src/types'
import { filter, firstValueFrom, timeout } from 'rxjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayerLoadingService } from '../src/service'
import {
  createMatchedResult,
  createMockDanmakuEntries,
  createMockDeps,
  createMockVideoInfo,
} from './helpers/mock-ports'

const wait = (service: PlayerLoadingService, step: LoadingState['step']) =>
  firstValueFrom(
    service.state$.pipe(
      filter((state) => state.step === step),
      timeout(2000),
    ),
  )
function ready(service: PlayerLoadingService): ReadyState {
  const state = service.currentState
  if (state.step !== 'ready') throw new Error(`预期 ready，实际 ${state.step}`)
  return state
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
const match = createMatchedResult().matches[0]
const comments: CommentsData = {
  count: 1,
  comments: [{ cid: 1, m: '新的弹幕', p: '20,1,16777215,1' }],
}
const local: DanmakuEntry = { ...createMockDanmakuEntries()[0], type: 'local', source: 'local.xml' }

describe('加载恢复与异步隔离', () => {
  let service: PlayerLoadingService
  afterEach(() => {
    service?.destroy()
    vi.restoreAllMocks()
  })

  it.each(['resolve', 'reject'] as const)('匹配等待时直接播放，忽略迟到 %s', async (completion) => {
    const pending = deferred<MatchResult>()
    const deps = createMockDeps({ api: { match: vi.fn(() => pending.promise), getDanmu: vi.fn() } })
    vi.mocked(deps.cache.get).mockResolvedValue([local])
    service = new PlayerLoadingService(deps)
    service.loadFromPath('/a.mkv')
    await vi.waitFor(() => expect(deps.api.match).toHaveBeenCalled())
    const signal = vi.mocked(deps.api.match).mock.calls[0][1]
    service.skipDanmaku()
    await wait(service, 'ready')
    const before = ready(service)
    expect(signal?.aborted).toBe(true)
    expect(before.danmaku).toEqual([local])
    expect(before.danmakuStatus).toBe('skipped')
    expect(deps.history.save).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ kind: 'electron-file' }),
        episodeId: 0,
      }),
    )
    if (completion === 'resolve') pending.resolve(createMatchedResult())
    else pending.reject(new Error('迟到网络错误'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(service.currentState).toBe(before)
    expect(deps.api.getDanmu).not.toHaveBeenCalled()
  })

  it('等待弹幕时跳过保留匹配，主动重试仅获取该集弹幕', async () => {
    const pending = deferred<CommentsData>()
    const deps = createMockDeps()
    vi.mocked(deps.api.getDanmu)
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValue(comments)
    service = new PlayerLoadingService(deps)
    service.loadFromPath('/a.mkv')
    await vi.waitFor(() => expect(deps.api.getDanmu).toHaveBeenCalled())
    service.skipDanmaku()
    await wait(service, 'ready')
    const video = ready(service).video
    expect(ready(service).match).toEqual(match)
    service.retryDanmaku()
    service.retryDanmaku()
    await wait(service, 'ready')
    expect(ready(service).video).toBe(video)
    expect(ready(service).mergedComments).toEqual(comments.comments)
    expect(deps.api.match).toHaveBeenCalledTimes(1)
    expect(deps.api.getDanmu).toHaveBeenCalledTimes(2)
    const before = ready(service)
    pending.resolve({ count: 0, comments: [] })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(service.currentState).toBe(before)
  })

  it('匹配失败可直接重试且不重新导入，失败后可以手动选择', async () => {
    const deps = createMockDeps()
    vi.mocked(deps.api.match).mockRejectedValue(new Error('请求超时'))
    service = new PlayerLoadingService(deps)
    service.loadFromPath('/a.mkv')
    await wait(service, 'match_failed')
    service.retryMatch()
    service.retryMatch()
    await wait(service, 'match_failed')
    expect(deps.api.match).toHaveBeenCalledTimes(2)
    expect(deps.importer.importFromPath).toHaveBeenCalledTimes(1)
    service.manualMatch()
    expect(service.currentState.step).toBe('waiting_user')
    service.selectMatch(match)
    await wait(service, 'ready')
    expect(ready(service).matchOrigin).toBe('manual')
  })

  it('首次弹幕请求失败保留同剧集缓存和本地来源，零条结果正常更新', async () => {
    const deps = createMockDeps()
    const entries = [...createMockDanmakuEntries(), local]
    vi.mocked(deps.history.get).mockResolvedValue({ hash: 'abc123hash', ...match })
    vi.mocked(deps.cache.get).mockResolvedValue(entries)
    vi.mocked(deps.cache.isStale).mockResolvedValue(true)
    vi.mocked(deps.api.getDanmu)
      .mockRejectedValueOnce(new Error('失败'))
      .mockResolvedValue({ count: 0, comments: [] })
    service = new PlayerLoadingService(deps)
    service.loadFromPath('/a.mkv')
    await wait(service, 'ready')
    expect(ready(service)).toMatchObject({ danmaku: entries, danmakuLoadFailed: true })
    service.retryDanmaku()
    await wait(service, 'ready')
    expect(ready(service).danmakuLoadFailed).toBe(false)
    expect(ready(service).danmaku[0].content.count).toBe(0)
    expect(ready(service).danmaku).toContainEqual(local)
  })

  it('重新匹配失败保留视频和原弹幕，再次重试使用失败目标', async () => {
    const deps = createMockDeps()
    service = new PlayerLoadingService(deps)
    service.loadFromPath('/a.mkv')
    await wait(service, 'ready')
    const before = ready(service)
    const target = { ...match, episodeId: 2222 }
    vi.mocked(deps.api.getDanmu)
      .mockRejectedValueOnce(new Error('目标不可用'))
      .mockResolvedValue(comments)
    service.rematch(target)
    expect(service.currentState).toMatchObject({
      step: 'reloading',
      match: before.match,
      danmaku: before.danmaku,
    })
    await wait(service, 'ready')
    expect(ready(service).video).toBe(before.video)
    expect(ready(service).danmaku).toBe(before.danmaku)
    expect(ready(service).match).toBe(before.match)
    expect(ready(service).recovery).toEqual({ target, message: '目标不可用' })
    service.retryDanmaku()
    await wait(service, 'ready')
    expect(deps.api.getDanmu).toHaveBeenLastCalledWith(2222, expect.any(Object))
    expect(ready(service).match).toEqual(target)
    expect(ready(service).recovery).toBeUndefined()
  })

  it.each(['cancel', 'different', 'same'] as const)(
    '恢复请求在 %s 后完成不能覆盖状态或存储',
    async (action) => {
      const deps = createMockDeps()
      service = new PlayerLoadingService(deps)
      service.loadFromPath('/a.mkv')
      await wait(service, 'ready')
      const pending = deferred<CommentsData>()
      vi.mocked(deps.api.getDanmu).mockImplementationOnce(() => pending.promise)
      service.rematch({ ...match, episodeId: 2222 })
      await vi.waitFor(() => expect(deps.api.getDanmu).toHaveBeenCalledTimes(2))
      if (action === 'cancel') service.cancel()
      else {
        vi.mocked(deps.importer.importFromPath).mockResolvedValueOnce(
          createMockVideoInfo({ hash: action === 'same' ? 'abc123hash' : 'other' }),
        )
        service.loadFromPath('/b.mkv')
        await wait(service, 'ready')
      }
      const before = service.currentState
      const writes = vi.mocked(deps.history.save).mock.calls.length
      pending.resolve(comments)
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(service.currentState).toBe(before)
      expect(deps.history.save).toHaveBeenCalledTimes(writes)
    },
  )

  it('同 hash 的较早持久化先完成，较新的结果最后提交', async () => {
    const deps = createMockDeps()
    service = new PlayerLoadingService(deps)
    service.loadFromPath('/a.mkv')
    await wait(service, 'ready')
    const pending = deferred<void>()
    const persisted: number[] = []
    vi.mocked(deps.history.save)
      .mockImplementationOnce(async (entry) => {
        await pending.promise
        persisted.push(entry.episodeId ?? 0)
      })
      .mockImplementation(async (entry) => {
        persisted.push(entry.episodeId ?? 0)
      })
    service.rematch({ ...match, episodeId: 2222 })
    await vi.waitFor(() => expect(deps.history.save).toHaveBeenCalledTimes(2))
    service.loadFromPath('/same.mkv')
    pending.resolve()
    await wait(service, 'ready')
    expect(persisted).toEqual([2222, 1001])
    expect(ready(service).match.episodeId).toBe(1001)
  })

  it('存储异常不误报网络失败，也不阻断视频', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = createMockDeps()
    vi.mocked(deps.history.get).mockRejectedValue(new Error('数据库不可用'))
    vi.mocked(deps.cache.get).mockRejectedValue(new Error('数据库不可用'))
    vi.mocked(deps.history.save).mockRejectedValue(new Error('空间不足'))
    vi.mocked(deps.cache.set).mockRejectedValue(new Error('空间不足'))
    service = new PlayerLoadingService(deps)
    service.loadFromPath('/a.mkv')
    await wait(service, 'ready')
    expect(ready(service).danmakuLoadFailed).toBeFalsy()
    expect(deps.cache.set).not.toHaveBeenCalled()
    expect(ready(service).mergedComments.length).toBeGreaterThan(0)
  })

  it('无归属在线缓存不沿用，Web 跳过保存元信息而非 File', async () => {
    const deps = createMockDeps()
    const file = new File(['a'], 'video.mkv', { lastModified: 123 })
    vi.mocked(deps.importer.importFromFile).mockResolvedValue(
      createMockVideoInfo({
        name: file.name,
        size: file.size,
        source: { kind: 'web-file', file, hash: 'abc123hash', name: file.name, size: file.size },
      }),
    )
    vi.mocked(deps.api.match).mockRejectedValue(new Error('失败'))
    vi.mocked(deps.cache.get).mockResolvedValue([...createMockDanmakuEntries(), local])
    service = new PlayerLoadingService(deps)
    service.loadFromFile(file)
    await wait(service, 'match_failed')
    service.skipDanmaku()
    await wait(service, 'ready')
    expect(ready(service).danmaku).toEqual([local])
    expect(deps.history.save).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { kind: 'web-file', name: file.name, size: 1, lastModified: 123 },
      }),
    )
  })

  it('导入失败仍使用媒体错误，非法跳过和已 ready 后点击不改变状态', async () => {
    const deps = createMockDeps()
    vi.mocked(deps.importer.importFromPath).mockRejectedValueOnce(new Error('无法读取'))
    service = new PlayerLoadingService(deps)
    service.loadFromPath('/bad.mkv')
    service.skipDanmaku()
    await wait(service, 'error')
    service.skipDanmaku()
    expect(service.currentState.step).toBe('error')
    service.loadFromPath('/ok.mkv')
    await wait(service, 'ready')
    const before = ready(service)
    service.skipDanmaku()
    expect(service.currentState).toBe(before)
  })
})
