import type { DanmakuEntry, HistoryEntry, LoadingState } from '../src/types'
import { filter, firstValueFrom, timeout } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import { PlayerLoadingService } from '../src/service'
import { createMockDeps, createUnmatchedResult } from './helpers/mock-ports'

const entry: DanmakuEntry = {
  type: 'local',
  source: 'local-file:abc/one.xml',
  selected: true,
  content: { count: 1, comments: [{ cid: 1, m: '本地', p: '1,1,#FFFFFF,1' }] },
}
const wait = (service: PlayerLoadingService, step: LoadingState['step']) =>
  firstValueFrom(
    service.state$.pipe(
      filter((s) => s.step === step),
      timeout(2000),
    ),
  )
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
async function setup() {
  const deps = createMockDeps()
  vi.mocked(deps.api.match).mockResolvedValue(createUnmatchedResult())
  const service = new PlayerLoadingService(deps)
  service.loadFromPath('/test.mkv')
  await wait(service, 'waiting_user')
  return { service, deps }
}

describe('等待选择时本地弹幕开播', () => {
  it('保存完成前仍等待，成功后开播且不请求在线弹幕', async () => {
    const { service, deps } = await setup()
    const gate = deferred()
    deps.history.save = vi.fn(async () => gate.promise)
    try {
      const saving = service.addLocalDanmaku(entry)
      await vi.waitFor(() => expect(deps.history.save).toHaveBeenCalled())
      expect(service.currentState.step).toBe('waiting_user')
      service.playNow()
      service.selectMatch(createUnmatchedResult().matches[0])
      expect(service.currentState.step).toBe('waiting_user')
      gate.resolve()
      await saving
      expect(service.currentState).toMatchObject({
        step: 'ready',
        match: { episodeId: 0 },
        danmaku: [entry],
      })
      expect(service.currentState).not.toHaveProperty('playNowFrom')
      expect(deps.api.getDanmu).not.toHaveBeenCalled()
      expect(deps.history.save).toHaveBeenCalledWith(
        expect.objectContaining({ danmaku: [entry], episodeId: 0 }),
        expect.any(Function),
      )
    } finally {
      service.destroy()
    }
  })

  it('失败保留候选，可重试，并保留已有来源', async () => {
    const { service, deps } = await setup()
    const initial = service.currentState
    const old = { ...entry, source: 'local-file:old/old.xml', selected: false }
    deps.history.get = vi.fn(async () => ({ hash: 'abc123hash', danmaku: [old] }))
    deps.history.save = vi
      .fn()
      .mockRejectedValueOnce(new Error('配额不足'))
      .mockResolvedValue(undefined)
    try {
      await expect(service.addLocalDanmaku(entry)).rejects.toThrow('配额不足')
      expect(service.currentState).toBe(initial)
      await service.addLocalDanmaku(entry)
      expect(service.currentState).toMatchObject({
        step: 'ready',
        danmaku: [old, entry],
        mergedComments: entry.content.comments,
      })
    } finally {
      service.destroy()
    }
  })

  it('提交期间取消使事务守卫失效，不发布 ready', async () => {
    const { service, deps } = await setup()
    const gate = deferred()
    deps.history.save = vi.fn(async (_entry, valid) => {
      await gate.promise
      if (!valid?.()) throw new Error('已取消')
    })
    const saving = service.addLocalDanmaku(entry)
    const rejected = expect(saving).rejects.toThrow('已取消')
    await vi.waitFor(() => expect(deps.history.save).toHaveBeenCalled())
    service.cancel()
    gate.resolve()
    await rejected
    expect(service.currentState.step).toBe('idle')
    service.destroy()
  })

  it('读取历史期间关闭操作或同文件重开，拒绝旧会话写入', async () => {
    const { service, deps } = await setup()
    const gate = deferred()
    deps.history.get = vi.fn(async () => {
      await gate.promise
      return null
    })
    const controller = new AbortController()
    const oldSession = service.sessionId
    const saving = service.addLocalDanmaku(entry, oldSession, controller.signal)
    const rejected = expect(saving).rejects.toThrow('视频已切换')
    controller.abort()
    gate.resolve()
    await rejected
    expect(deps.history.save).not.toHaveBeenCalled()
    service.loadFromPath('/test.mkv')
    await wait(service, 'waiting_user')
    await expect(service.addLocalDanmaku(entry, oldSession)).rejects.toThrow('视频已切换')
    service.destroy()
  })

  it('成功记录可用于再次打开，原文件不参与恢复', async () => {
    const { service, deps } = await setup()
    let record: HistoryEntry | null = null
    deps.history.save = vi.fn(async (value) => {
      record = value
    })
    deps.history.get = vi.fn(async () => record)
    deps.cache.get = vi.fn(async () => record?.danmaku ?? null)
    await service.addLocalDanmaku(entry)
    service.loadFromPath('/test.mkv')
    await wait(service, 'waiting_user')
    service.playNow()
    await wait(service, 'ready')
    expect(service.currentState).toMatchObject({ danmaku: [entry] })
    service.destroy()
  })
})

describe('播放中本地来源', () => {
  it('并发去重在队列内执行，同名不同内容可共存，不更换视频和匹配', async () => {
    const deps = createMockDeps()
    const service = new PlayerLoadingService(deps)
    service.loadFromPath('/test.mkv')
    await wait(service, 'ready')
    const initial = service.currentState
    try {
      const results = await Promise.allSettled([
        service.addLocalDanmaku(entry),
        service.addLocalDanmaku({ ...entry, source: 'local-file:abc/renamed.xml' }),
      ])
      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected'])
      await service.addLocalDanmaku({ ...entry, source: 'local-file:different/one.xml' })
      if (initial.step !== 'ready' || service.currentState.step !== 'ready')
        throw new Error('状态错误')
      expect(service.currentState.video).toBe(initial.video)
      expect(service.currentState.match).toBe(initial.match)
      expect(service.currentState.danmaku).toHaveLength(initial.danmaku.length + 2)
    } finally {
      service.destroy()
    }
  })
})
