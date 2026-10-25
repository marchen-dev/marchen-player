import type { ServiceDeps, VideoInfo } from '@marchen/player-loading'
import { PlayerLoadingService } from '@marchen/player-loading'
import { MediaSourceError } from '@marchen/shared/media-sources'
import { firstValueFrom } from 'rxjs'
import { filter } from 'rxjs/operators'
import { describe, expect, it, vi } from 'vitest'

const video: VideoInfo = {
  source: {
    kind: 'provider-item',
    hash: 'provider:s:e',
    sourceId: 's',
    provider: 'webdav',
    itemRef: 'e',
    name: 'EP01.mkv',
    size: 3,
  },
  hash: 'provider:s:e',
  name: 'EP01.mkv',
  size: 3,
  playList: [],
}

function setup(importFromProvider: NonNullable<ServiceDeps['importer']['importFromProvider']>) {
  const deps: ServiceDeps = {
    api: {
      match: vi.fn(async () => ({ isMatched: false, matches: [] })),
      getDanmu: vi.fn(),
    },
    cache: {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
      isStale: vi.fn(async () => false),
    },
    importer: {
      importFromFile: vi.fn(),
      importFromPath: vi.fn(),
      importFromProvider: vi.fn(importFromProvider),
    },
    history: { save: vi.fn(async () => {}), get: vi.fn(async () => null) },
  }
  return { deps, service: new PlayerLoadingService(deps) }
}

describe('媒体源加载命令', () => {
  it('经 importer 导入，没有识别前缀时交给用户手动匹配', async () => {
    const { deps, service } = setup(async () => video)
    service.loadFromProvider('s', 'e')
    const state = await firstValueFrom(
      service.state$.pipe(filter((next) => next.step === 'waiting_user')),
    )
    expect(deps.importer.importFromProvider).toHaveBeenCalledWith('s', 'e', expect.any(AbortSignal))
    expect(state.step === 'waiting_user' && state.video.hash).toBe('provider:s:e')
    expect(deps.api.match).not.toHaveBeenCalled()
    service.destroy()
  })

  it('有识别前缀时按前缀 hash 匹配', async () => {
    const { deps, service } = setup(async () => ({ ...video, matchHash: 'a'.repeat(32) }))
    service.loadFromProvider('s', 'e')
    await firstValueFrom(service.state$.pipe(filter((next) => next.step === 'waiting_user')))
    expect(deps.api.match).toHaveBeenCalledWith(
      { hash: 'a'.repeat(32), size: 3, name: 'EP01.mkv' },
      expect.any(AbortSignal),
    )
  })

  it('打开失败时错误状态保留请求，供界面重试', async () => {
    const { service } = setup(async () => {
      throw new MediaSourceError('auth_failed')
    })
    service.loadFromProvider('s', 'e')
    const state = await firstValueFrom(service.state$.pipe(filter((next) => next.step === 'error')))
    expect(state.step === 'error' && state.providerRequest).toEqual({ sourceId: 's', itemRef: 'e' })
  })
})
