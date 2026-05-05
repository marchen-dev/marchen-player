/**
 * 加载 Pipeline 测试
 *
 * 测试缓存命中、新番刷新、网络错误等场景
 */

import type { LoadingState } from '../../src/types'
import { filter, firstValueFrom, take, timeout } from 'rxjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayerLoadingService } from '../../src/service'
import {
  createMockDanmakuEntries,
  createMockDeps,
} from '../helpers/mock-ports'

function waitForStep(service: PlayerLoadingService, step: string): Promise<LoadingState> {
  return firstValueFrom(
    service.state$.pipe(
      filter((s) => s.step === step),
      take(1),
      timeout(3000),
    ),
  )
}

describe('load Pipeline - 缓存策略', () => {
  let service: PlayerLoadingService

  afterEach(() => {
    service?.destroy()
  })

  it('有缓存且非新番时应该使用缓存，不调用 API', async () => {
    const cachedDanmaku = createMockDanmakuEntries()
    const deps = createMockDeps({
      cache: {
        get: vi.fn().mockResolvedValue(cachedDanmaku),
        isStale: vi.fn().mockResolvedValue(false),
        set: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
      },
    })
    service = new PlayerLoadingService(deps)

    service.loadFromPath('/test.mkv')
    const state = await waitForStep(service, 'playing')

    expect(state.step).toBe('playing')
    // 不应该调用 getDanmu（使用了缓存）
    expect(deps.api.getDanmu).not.toHaveBeenCalled()
  })

  it('新番时应该忽略缓存，重新请求', async () => {
    const cachedDanmaku = createMockDanmakuEntries()
    const deps = createMockDeps({
      cache: {
        get: vi.fn().mockResolvedValue(cachedDanmaku),
        isStale: vi.fn().mockResolvedValue(true), // 新番
        set: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
      },
    })
    service = new PlayerLoadingService(deps)

    service.loadFromPath('/test.mkv')
    const state = await waitForStep(service, 'playing')

    expect(state.step).toBe('playing')
    // 应该调用 getDanmu（新番强制刷新）
    expect(deps.api.getDanmu).toHaveBeenCalled()
  })

  it('无缓存时应该请求 API', async () => {
    const deps = createMockDeps({
      cache: {
        get: vi.fn().mockResolvedValue(null),
        isStale: vi.fn().mockResolvedValue(false),
        set: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
      },
    })
    service = new PlayerLoadingService(deps)

    service.loadFromPath('/test.mkv')
    const state = await waitForStep(service, 'playing')

    expect(state.step).toBe('playing')
    expect(deps.api.getDanmu).toHaveBeenCalled()
    // 应该写入缓存
    expect(deps.cache.set).toHaveBeenCalled()
  })
})

describe('load Pipeline - 错误处理', () => {
  let service: PlayerLoadingService

  afterEach(() => {
    service?.destroy()
  })

  it('aPI 匹配失败时应该进入 error 状态', async () => {
    const deps = createMockDeps({
      api: {
        match: vi.fn().mockRejectedValue(new Error('网络错误')),
        getDanmu: vi.fn(),
      },
    })
    service = new PlayerLoadingService(deps)

    service.loadFromPath('/test.mkv')
    const state = await waitForStep(service, 'error')

    expect(state.step).toBe('error')
    expect((state as any).error.message).toBe('网络错误')
  })

  it('弹幕获取失败时应该降级为无弹幕播放', async () => {
    const deps = createMockDeps({
      api: {
        match: vi.fn().mockResolvedValue({
          isMatched: true,
          matches: [{ episodeId: 1, animeTitle: 'A', episodeTitle: 'E1', animeId: 1 }],
        }),
        getDanmu: vi.fn().mockRejectedValue(new Error('弹幕服务不可用')),
      },
    })
    service = new PlayerLoadingService(deps)

    service.loadFromPath('/test.mkv')
    // 弹幕获取失败时降级为 playing（无弹幕），不进入 error
    const state = await waitForStep(service, 'playing')

    expect(state.step).toBe('playing')
    // 弹幕应该为空（降级）
    expect((state as any).mergedComments).toEqual([])
  })
})
