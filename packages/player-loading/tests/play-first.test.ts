import type {
  CommentsData,
  DanmakuEntry,
  LoadingState,
  MatchResult,
  ReadyState,
  ServiceDeps,
} from '../src/types'
import { filter, firstValueFrom, timeout } from 'rxjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayerLoadingService } from '../src/service'
import {
  createMatchedResult,
  createMockDanmakuEntries,
  createMockDeps,
  createMockVideoInfo,
  createUnmatchedResult,
} from './helpers/mock-ports'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const until = (service: PlayerLoadingService, predicate: (state: LoadingState) => boolean) =>
  firstValueFrom(service.state$.pipe(filter(predicate), timeout(2000)))
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

function ready(service: PlayerLoadingService): ReadyState {
  const state = service.currentState
  if (state.step !== 'ready') throw new Error(`预期 ready，实际 ${state.step}`)
  return state
}

const match = createMatchedResult().matches[0]
const comments: CommentsData = {
  count: 1,
  comments: [{ cid: 9, m: '后台弹幕', p: '3,1,16777215,1' }],
}
const local: DanmakuEntry = { ...createMockDanmakuEntries()[0], type: 'local', source: 'local.xml' }
const history = {
  hash: 'abc123hash',
  episodeId: match.episodeId,
  animeId: match.animeId,
  animeTitle: match.animeTitle,
  episodeTitle: match.episodeTitle,
}

const playFirstDeps = (overrides?: Partial<ServiceDeps>) =>
  createMockDeps({ ...overrides, policy: { playFirst: () => true } })

/** 记录经过的 step，验证优先播放不会经过会拆掉媒体会话的阶段 */
const recordSteps = (service: PlayerLoadingService) => {
  const steps: LoadingState['step'][] = []
  service.state$.subscribe((state) => steps.push(state.step))
  return steps
}

describe('优先播放模式', () => {
  let service: PlayerLoadingService
  afterEach(() => {
    service?.destroy()
    vi.restoreAllMocks()
  })

  it('关闭或未提供策略时保持先加载弹幕再播放', async () => {
    for (const policy of [undefined, { playFirst: () => false }]) {
      const deps = createMockDeps({ policy })
      service = new PlayerLoadingService(deps)
      const steps = recordSteps(service)
      service.loadFromPath('/a.mkv')
      await until(service, (state) => state.step === 'ready')
      expect(steps).toContain('loading_danmaku')
      expect(ready(service).background).toBeUndefined()
      expect(ready(service).mergedComments).toHaveLength(3)
      service.destroy()
    }
  })

  it('首次打开立即开播，后台匹配和弹幕到达后在同一视频上接入', async () => {
    const pendingMatch = deferred<MatchResult>()
    const pendingDanmu = deferred<CommentsData>()
    const deps = playFirstDeps({
      api: {
        match: vi.fn(() => pendingMatch.promise),
        getDanmu: vi.fn(() => pendingDanmu.promise),
      },
    })
    service = new PlayerLoadingService(deps)
    const steps = recordSteps(service)
    service.loadFromPath('/a.mkv')

    await until(service, (state) => state.step === 'ready')
    const started = ready(service)
    expect(started.background).toEqual({ phase: 'matching' })
    expect(started.match.episodeId).toBe(0)
    expect(deps.history.save).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ kind: 'electron-file' }),
        episodeId: 0,
      }),
    )

    pendingMatch.resolve(createMatchedResult())
    await until(
      service,
      (state) => state.step === 'ready' && state.background?.phase === 'loading_danmaku',
    )
    pendingDanmu.resolve(comments)
    await until(service, (state) => state.step === 'ready' && !state.background)

    const done = ready(service)
    expect(done.video).toBe(started.video)
    expect(done.match).toEqual(match)
    expect(done.matchOrigin).toBe('auto')
    expect(done.danmakuStatus).toBe('loaded')
    expect(done.mergedComments).toEqual(comments.comments)
    expect(deps.history.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ episodeId: match.episodeId, animeId: match.animeId }),
    )
    expect(deps.cache.set).toHaveBeenCalledWith('abc123hash', done.danmaku)
    expect(steps).not.toContain('loading_danmaku')
    expect(steps).not.toContain('waiting_user')
    expect(steps).not.toContain('reloading')
  })

  it('本地匹配且缓存有效时带弹幕开播，不发起网络请求', async () => {
    const cached = createMockDanmakuEntries()
    const deps = playFirstDeps()
    vi.mocked(deps.history.get).mockResolvedValue(history)
    vi.mocked(deps.cache.get).mockResolvedValue(cached)
    service = new PlayerLoadingService(deps)
    service.loadFromPath('/a.mkv')
    await until(service, (state) => state.step === 'ready')
    await settle()

    const state = ready(service)
    expect(state.background).toBeUndefined()
    expect(state.matchOrigin).toBe('history')
    expect(state.danmakuStatus).toBe('loaded')
    expect(state.mergedComments).toHaveLength(3)
    expect(deps.api.match).not.toHaveBeenCalled()
    expect(deps.api.getDanmu).not.toHaveBeenCalled()
  })

  it.each([
    ['成功', true],
    ['失败', false],
  ] as const)('缓存过期时先用旧缓存开播，后台刷新%s', async (_label, succeed) => {
    const cached = createMockDanmakuEntries()
    const pendingDanmu = deferred<CommentsData>()
    const deps = playFirstDeps({
      api: { match: vi.fn(), getDanmu: vi.fn(() => pendingDanmu.promise) },
    })
    vi.mocked(deps.history.get).mockResolvedValue(history)
    vi.mocked(deps.cache.get).mockResolvedValue(cached)
    vi.mocked(deps.cache.isStale).mockResolvedValue(true)
    service = new PlayerLoadingService(deps)
    service.loadFromPath('/a.mkv')

    await until(service, (state) => state.step === 'ready')
    expect(ready(service).background).toEqual({ phase: 'loading_danmaku' })
    expect(ready(service).mergedComments).toHaveLength(3)

    if (succeed) pendingDanmu.resolve(comments)
    else pendingDanmu.reject(new Error('网络错误'))
    await until(service, (state) => state.step === 'ready' && !state.background)

    const state = ready(service)
    expect(deps.api.match).not.toHaveBeenCalled()
    expect(state.match).toEqual(match)
    expect(state.danmakuLoadFailed).toBe(!succeed)
    expect(state.mergedComments).toEqual(succeed ? comments.comments : cached[0].content.comments)
  })

  it('本地历史和缓存读取失败时仍然开播并进入后台匹配', async () => {
    const deps = playFirstDeps()
    vi.mocked(deps.history.get).mockRejectedValue(new Error('IndexedDB 不可用'))
    vi.mocked(deps.cache.get).mockRejectedValue(new Error('IndexedDB 不可用'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    service = new PlayerLoadingService(deps)
    service.loadFromPath('/a.mkv')
    await until(service, (state) => state.step === 'ready' && !state.background)
    expect(deps.api.match).toHaveBeenCalled()
    expect(ready(service).match).toEqual(match)
  })

  it('无精确匹配时停留在播放中并保存候选', async () => {
    const deps = playFirstDeps({
      api: {
        match: vi.fn().mockResolvedValue(createUnmatchedResult()),
        getDanmu: vi.fn().mockResolvedValue(comments),
      },
    })
    service = new PlayerLoadingService(deps)
    const steps = recordSteps(service)
    service.loadFromPath('/a.mkv')
    await until(service, (state) => state.step === 'ready' && !state.background)

    const state = ready(service)
    expect(state.danmakuStatus).toBe('unmatched')
    expect(state.matchCandidates).toEqual(createUnmatchedResult())
    expect(steps).not.toContain('waiting_user')
    expect(deps.api.getDanmu).not.toHaveBeenCalled()

    // 选择候选后热更新弹幕，不重开视频，并清除候选
    service.rematch(state.matchCandidates!.matches[1])
    await until(service, (next) => next.step === 'ready' && next.match.episodeId === 1002)
    expect(ready(service).video).toBe(state.video)
    expect(ready(service).matchCandidates).toBeUndefined()
  })

  it('匹配接口失败后可在播放中原地重试', async () => {
    const deps = playFirstDeps()
    vi.mocked(deps.api.match).mockRejectedValueOnce(new Error('请求超时'))
    service = new PlayerLoadingService(deps)
    service.loadFromPath('/a.mkv')
    await until(service, (state) => state.step === 'ready' && !!state.matchError)
    const failed = ready(service)
    expect(failed.matchError).toEqual({ message: '请求超时' })

    service.retryMatch()
    await until(
      service,
      (state) => state.step === 'ready' && !state.background && !state.matchError,
    )
    expect(ready(service).video).toBe(failed.video)
    expect(ready(service).match).toEqual(match)
    expect(deps.api.match).toHaveBeenCalledTimes(2)
    expect(deps.importer.importFromPath).toHaveBeenCalledTimes(1)
  })

  it('弹幕接口失败保留本地弹幕，零条弹幕按成功处理', async () => {
    const failing = playFirstDeps()
    vi.mocked(failing.api.getDanmu).mockRejectedValue(new Error('500'))
    vi.mocked(failing.cache.get).mockResolvedValue([local])
    vi.spyOn(console, 'error').mockImplementation(() => {})
    service = new PlayerLoadingService(failing)
    service.loadFromPath('/a.mkv')
    await until(service, (state) => state.step === 'ready' && !state.background)
    expect(ready(service).danmakuLoadFailed).toBe(true)
    expect(ready(service).match).toEqual(match)
    expect(ready(service).danmaku).toEqual([local])
    service.destroy()

    const empty = playFirstDeps()
    vi.mocked(empty.api.getDanmu).mockResolvedValue({ count: 0, comments: [] })
    service = new PlayerLoadingService(empty)
    service.loadFromPath('/a.mkv')
    await until(service, (state) => state.step === 'ready' && !state.background)
    expect(ready(service).danmakuStatus).toBe('loaded')
    expect(ready(service).danmakuLoadFailed).toBe(false)
  })
})

describe('优先播放后台隔离', () => {
  let service: PlayerLoadingService
  afterEach(() => {
    service?.destroy()
    vi.restoreAllMocks()
  })

  it.each(['切集', '同一文件重开'] as const)('后台匹配中%s，迟到结果被丢弃', async (kind) => {
    const first = deferred<MatchResult>()
    const deps = playFirstDeps()
    vi.mocked(deps.api.match).mockImplementationOnce(() => first.promise)
    vi.mocked(deps.importer.importFromPath).mockImplementation(async (path) =>
      createMockVideoInfo(
        kind === '切集' && path === '/b.mkv' ? { hash: 'other-hash', name: 'b.mkv' } : {},
      ),
    )
    service = new PlayerLoadingService(deps)
    service.loadFromPath('/a.mkv')
    await vi.waitFor(() => expect(deps.api.match).toHaveBeenCalledTimes(1))
    const signal = vi.mocked(deps.api.match).mock.calls[0][1]

    service.loadFromPath(kind === '切集' ? '/b.mkv' : '/a.mkv')
    await until(service, (state) => state.step === 'ready' && !state.background)
    const second = ready(service)
    const saves = vi.mocked(deps.history.save).mock.calls.length
    expect(signal?.aborted).toBe(true)

    first.resolve({ isMatched: true, matches: [{ ...match, episodeId: 4242 }] })
    await settle()
    expect(service.currentState).toBe(second)
    expect(vi.mocked(deps.history.save).mock.calls.length).toBe(saves)
    expect(deps.api.getDanmu).not.toHaveBeenCalledWith(4242, expect.anything())
  })

  it('后台匹配中用户手动匹配，以用户选择为准', async () => {
    const pending = deferred<MatchResult>()
    const deps = playFirstDeps({
      api: { match: vi.fn(() => pending.promise), getDanmu: vi.fn().mockResolvedValue(comments) },
    })
    service = new PlayerLoadingService(deps)
    service.loadFromPath('/a.mkv')
    await until(service, (state) => state.step === 'ready')

    const chosen = { ...match, episodeId: 2002, episodeTitle: '第2话' }
    service.rematch(chosen)
    await until(service, (state) => state.step === 'ready' && state.match.episodeId === 2002)
    const afterManual = ready(service)
    expect(afterManual.background).toBeUndefined()

    pending.resolve(createMatchedResult())
    await settle()
    expect(service.currentState).toBe(afterManual)
    expect(deps.api.getDanmu).toHaveBeenCalledTimes(1)
  })

  it('后台弹幕请求期间导入的本地弹幕在接入后仍保留', async () => {
    const pending = deferred<CommentsData>()
    const deps = playFirstDeps({
      api: {
        match: vi.fn().mockResolvedValue(createMatchedResult()),
        getDanmu: vi.fn(() => pending.promise),
      },
    })
    service = new PlayerLoadingService(deps)
    service.loadFromPath('/a.mkv')
    await until(
      service,
      (state) => state.step === 'ready' && state.background?.phase === 'loading_danmaku',
    )

    await service.addLocalDanmaku(local)
    expect(ready(service).danmaku).toEqual([local])
    pending.resolve(comments)
    await until(service, (state) => state.step === 'ready' && !state.background)

    const sources = ready(service).danmaku.map((entry) => entry.source)
    expect(sources).toEqual(['dandanplay', 'local.xml'])
    expect(deps.cache.set).toHaveBeenLastCalledWith('abc123hash', ready(service).danmaku)
  })

  it('开播后取消，迟到结果不写入历史', async () => {
    const pending = deferred<MatchResult>()
    const deps = playFirstDeps({ api: { match: vi.fn(() => pending.promise), getDanmu: vi.fn() } })
    service = new PlayerLoadingService(deps)
    service.loadFromPath('/a.mkv')
    await until(service, (state) => state.step === 'ready')
    expect(deps.history.save).toHaveBeenCalledTimes(1)

    service.cancel()
    pending.resolve(createMatchedResult())
    await settle()
    expect(service.currentState.step).toBe('idle')
    expect(deps.history.save).toHaveBeenCalledTimes(1)
    expect(deps.api.getDanmu).not.toHaveBeenCalled()
  })

  it('播放中切换策略只影响下一次加载', async () => {
    let playFirst = true
    const pending = deferred<MatchResult>()
    const deps = createMockDeps({ policy: { playFirst: () => playFirst } })
    vi.mocked(deps.api.match).mockImplementationOnce(() => pending.promise)
    service = new PlayerLoadingService(deps)
    service.loadFromPath('/a.mkv')
    await until(service, (state) => state.step === 'ready')

    playFirst = false
    pending.resolve(createMatchedResult())
    await until(service, (state) => state.step === 'ready' && !state.background)
    expect(ready(service).match).toEqual(match)

    const steps = recordSteps(service)
    service.loadFromPath('/a.mkv')
    await until(service, (state) => state.step === 'ready' && steps.includes('loading_danmaku'))
  })
})
