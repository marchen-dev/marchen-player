/**
 * 播放中重新匹配 Pipeline 测试
 *
 * 测试热更新弹幕、PlayerBridge 调用
 */

import type { LoadingState } from '../../src/types'
import { filter, firstValueFrom, take, timeout } from 'rxjs'
import { afterEach, describe, expect, it } from 'vitest'
import { PlayerLoadingService } from '../../src/service'
import {
  createMockDeps,
  createMockPlayerBridge,
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

describe('rematch Pipeline', () => {
  let service: PlayerLoadingService

  afterEach(() => {
    service?.destroy()
  })

  it('播放中 rematch 应该经过 reloading → playing', async () => {
    const deps = createMockDeps()
    service = new PlayerLoadingService(deps)

    // 先进入 playing 状态
    service.loadFromPath('/test.mkv')
    await waitForStep(service, 'playing')

    // 触发 rematch
    service.rematch({
      episodeId: 2001,
      animeTitle: '新匹配',
      episodeTitle: '第2话',
      animeId: 200,
    })

    // 应该经过 reloading 再回到 playing
    const reloadingState = await waitForStep(service, 'reloading')
    expect(reloadingState.step).toBe('reloading')

    const playingState = await waitForStep(service, 'playing')
    expect(playingState.step).toBe('playing')
    // 弹幕应该已更新
    expect(deps.api.getDanmu).toHaveBeenCalledWith(2001, expect.any(Object))
  })

  it('rematch 应该调用 PlayerBridge.updateDanmaku', async () => {
    const deps = createMockDeps()
    const bridge = createMockPlayerBridge()
    service = new PlayerLoadingService(deps)
    service.connectPlayer(bridge)

    // 先进入 playing
    service.loadFromPath('/test.mkv')
    await waitForStep(service, 'playing')

    // rematch
    service.rematch({
      episodeId: 3001,
      animeTitle: '重新匹配',
      episodeTitle: '第3话',
      animeId: 300,
    })

    await waitForStep(service, 'playing')

    // PlayerBridge 应该被调用
    expect(bridge.updateDanmaku).toHaveBeenCalled()
  })

  it('非 playing 状态下 rematch 应该被忽略', async () => {
    const deps = createMockDeps()
    service = new PlayerLoadingService(deps)

    // 在 idle 状态下 rematch
    service.rematch({
      episodeId: 1001,
      animeTitle: 'test',
      episodeTitle: 'E1',
      animeId: 100,
    })

    // 状态应该保持 idle
    expect(service.currentState.step).toBe('idle')
  })

  it('addLocalDanmaku 应该追加弹幕并通知播放器', async () => {
    const deps = createMockDeps()
    const bridge = createMockPlayerBridge()
    service = new PlayerLoadingService(deps)
    service.connectPlayer(bridge)

    // 先进入 playing
    service.loadFromPath('/test.mkv')
    await waitForStep(service, 'playing')

    // 添加本地弹幕
    await service.addLocalDanmaku({
      type: 'local',
      source: 'test.xml',
      selected: true,
      content: {
        count: 2,
        comments: [
          { cid: 100, m: '本地弹幕1', p: '1.00,1,16777215,local' },
          { cid: 101, m: '本地弹幕2', p: '2.00,1,16777215,local' },
        ],
      },
    })

    const state = service.currentState
    expect(state.step).toBe('playing')
    if (state.step === 'playing') {
      // 弹幕列表应该包含新增的 local 条目
      expect(state.danmaku.length).toBeGreaterThan(1)
      expect(state.danmaku.some((d) => d.source === 'test.xml')).toBe(true)
    }
    // PlayerBridge 应该被调用
    expect(bridge.updateDanmaku).toHaveBeenCalled()
  })
})
