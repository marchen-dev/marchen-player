/**
 * PlayerLoadingService 状态机转换测试
 *
 * 测试核心状态转换：正常加载、未匹配→用户选择、跳过弹幕、取消
 */

import type { LoadingState } from '../src/types'
import { filter, firstValueFrom, take, timeout } from 'rxjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayerLoadingService } from '../src/service'
import { createMockDeps, createMockVideoInfo, createUnmatchedResult } from './helpers/mock-ports'

// 辅助函数：等待特定步骤
function waitForStep(service: PlayerLoadingService, step: string): Promise<LoadingState> {
  return firstValueFrom(
    service.state$.pipe(
      filter((s) => s.step === step),
      take(1),
      timeout(3000),
    ),
  )
}

describe('playerLoadingService', () => {
  let service: PlayerLoadingService

  afterEach(() => {
    service?.destroy()
  })

  describe('正常加载流程（精准匹配）', () => {
    it('应该依次经过 importing → matching → loading_danmaku → ready，并稳定停在 ready', async () => {
      const deps = createMockDeps()
      service = new PlayerLoadingService(deps)

      // 触发加载
      service.loadFromPath('/test/video.mkv')

      const finalState = await waitForStep(service, 'ready')

      expect(finalState.step).toBe('ready')
      expect(finalState).toHaveProperty('video')
      expect(finalState).toHaveProperty('match')
      expect(finalState).toHaveProperty('danmaku')
      expect(deps.importer.importFromPath).toHaveBeenCalledWith('/test/video.mkv')
      expect(deps.api.getDanmu).toHaveBeenCalled()
      expect(deps.history.save).toHaveBeenCalled()
      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(service.currentState.step).toBe('ready')
    })

    it('loadFromFile 应该调用 importFromFile', async () => {
      const deps = createMockDeps()
      service = new PlayerLoadingService(deps)

      const mockFile = new File([''], 'test.mkv', { type: 'video/x-matroska' })
      service.loadFromFile(mockFile)

      await waitForStep(service, 'ready')
      expect(deps.importer.importFromFile).toHaveBeenCalledWith(mockFile)
    })
  })

  describe('未匹配 → 用户选择', () => {
    it('未精准匹配时应该进入 waiting_user 状态', async () => {
      const deps = createMockDeps({
        api: { match: vi.fn().mockResolvedValue(createUnmatchedResult()) } as any,
      })
      service = new PlayerLoadingService(deps)

      service.loadFromPath('/test/video.mkv')

      const state = await waitForStep(service, 'waiting_user')
      expect(state.step).toBe('waiting_user')
      expect((state as any).matchData.isMatched).toBe(false)
    })

    it('用户 selectMatch 后应该继续加载弹幕并进入 ready', async () => {
      const deps = createMockDeps({
        api: { match: vi.fn().mockResolvedValue(createUnmatchedResult()) } as any,
      })
      service = new PlayerLoadingService(deps)

      service.loadFromPath('/test/video.mkv')
      await waitForStep(service, 'waiting_user')

      // 用户选择
      service.selectMatch({
        episodeId: 2001,
        animeTitle: '用户选择的动漫',
        episodeTitle: '第1话',
        animeId: 200,
      })

      const finalState = await waitForStep(service, 'ready')
      expect(finalState.step).toBe('ready')
      expect((finalState as any).match.episodeId).toBe(2001)
    })
  })

  describe('跳过弹幕', () => {
    it('用户 skipDanmaku 后应该直接进入 ready', async () => {
      const deps = createMockDeps({
        api: { match: vi.fn().mockResolvedValue(createUnmatchedResult()) } as any,
      })
      service = new PlayerLoadingService(deps)

      service.loadFromPath('/test/video.mkv')
      await waitForStep(service, 'waiting_user')

      service.skipDanmaku()

      const finalState = await waitForStep(service, 'ready')
      expect(finalState.step).toBe('ready')
    })
  })

  describe('取消加载', () => {
    it('cancel 应该回到 idle 状态', async () => {
      const deps = createMockDeps({
        // 让 import 慢一点，给 cancel 时间
        importer: {
          importFromPath: vi
            .fn()
            .mockImplementation(
              () => new Promise((resolve) => setTimeout(() => resolve(createMockVideoInfo()), 100)),
            ),
        } as any,
      })
      service = new PlayerLoadingService(deps)

      service.loadFromPath('/test/video.mkv')
      // 立即取消
      service.cancel()

      const state = await waitForStep(service, 'idle')
      expect(state.step).toBe('idle')
    })
  })

  describe('新 load 自动取消旧 load', () => {
    it('第二个 loadFromPath 应该取消第一个', async () => {
      const deps = createMockDeps({
        importer: {
          importFromPath: vi
            .fn()
            .mockImplementationOnce(
              () =>
                new Promise((resolve) =>
                  setTimeout(() => resolve(createMockVideoInfo({ hash: 'first' })), 200),
                ),
            )
            .mockImplementationOnce(() => Promise.resolve(createMockVideoInfo({ hash: 'second' }))),
        } as any,
      })
      service = new PlayerLoadingService(deps)

      service.loadFromPath('/first.mkv')
      // 立即发第二个
      service.loadFromPath('/second.mkv')

      const finalState = await waitForStep(service, 'ready')
      expect((finalState as any).video.hash).toBe('second')

      // 等第一条不可取消的 Promise 也完成，确认其迟到结果不会覆盖当前状态。
      await new Promise((resolve) => setTimeout(resolve, 250))
      expect(service.currentState.step).toBe('ready')
      if (service.currentState.step === 'ready') {
        expect(service.currentState.video.hash).toBe('second')
      }
    })
  })

  describe('临时播放源释放', () => {
    it('取消后迟到完成的 importer 仍会释放来源', async () => {
      const releaseSource = vi.fn()
      const deps = createMockDeps({
        importer: {
          importFromPath: vi.fn(
            () =>
              new Promise((resolve) =>
                setTimeout(() => resolve(createMockVideoInfo({ releaseSource })), 30),
              ),
          ),
        } as any,
      })
      service = new PlayerLoadingService(deps)

      service.loadFromPath('/late.mkv')
      service.cancel()
      await new Promise((resolve) => setTimeout(resolve, 60))

      expect(releaseSource).toHaveBeenCalledOnce()
      expect(service.currentState.step).toBe('idle')
    })

    it('匹配失败时释放已导入的来源', async () => {
      const releaseSource = vi.fn()
      const deps = createMockDeps({
        importer: {
          importFromPath: vi.fn().mockResolvedValue(createMockVideoInfo({ releaseSource })),
        } as any,
        api: { match: vi.fn().mockRejectedValue(new Error('match failed')) } as any,
      })
      service = new PlayerLoadingService(deps)

      service.loadFromPath('/failed.mkv')
      await waitForStep(service, 'error')

      expect(releaseSource).toHaveBeenCalledOnce()
    })

    it('ready 会保留来源，直到 cancel 才释放', async () => {
      const releaseSource = vi.fn()
      const deps = createMockDeps({
        importer: {
          importFromPath: vi.fn().mockResolvedValue(createMockVideoInfo({ releaseSource })),
        } as any,
      })
      service = new PlayerLoadingService(deps)

      service.loadFromPath('/ready.mkv')
      await waitForStep(service, 'ready')
      expect(releaseSource).not.toHaveBeenCalled()

      service.cancel()
      expect(releaseSource).toHaveBeenCalledOnce()
    })
  })
})
