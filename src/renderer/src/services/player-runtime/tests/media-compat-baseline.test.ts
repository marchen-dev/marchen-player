import { rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadHistoricalVideo } from '../../player-loading/load-history'
import { resolvePlaylistNeighbors } from '../history/playlist'
import { createWebSourceLifecyclePort } from '../platform/web'

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  )
})

describe('媒体兼容改造前的播放链路基线', () => {
  it('web 直放为本地文件创建独立 Blob URL，并由 handle 释放', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:web-direct')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const lifecycle = createWebSourceLifecyclePort()
    const file = new File(['video'], 'direct.mp4', { type: 'video/mp4' })

    const handle = await lifecycle.prepareResource({ kind: 'file', file })
    expect(handle.url).toBe('blob:web-direct')
    expect(createObjectURL).toHaveBeenCalledWith(file)

    handle.release()
    handle.release()
    expect(revokeObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:web-direct')
  })

  it('影视库恢复只把 HISTORY 原始路径交回统一加载服务', async () => {
    const loadFromPath = vi.fn()
    const result = await loadHistoricalVideo('video-hash', {
      history: {
        get: vi.fn(async () => ({
          hash: 'video-hash',
          source: {
            kind: 'electron-file' as const,
            path: '/library/episode-01.mkv',
            name: 'episode-01.mkv',
            size: 1,
          },
          progress: 120,
          duration: 1_200,
          updatedAt: '2026-08-30T00:00:00.000Z',
        })),
      },
      service: { loadFromPath },
    })

    expect(result).toEqual({ status: 'loaded', path: '/library/episode-01.mkv' })
    expect(loadFromPath).toHaveBeenCalledOnce()
    expect(loadFromPath).toHaveBeenCalledWith('/library/episode-01.mkv')
  })

  it('播放列表用稳定原始路径识别当前视频', () => {
    const playlist = [
      { id: '01', name: '第一集', path: '/library/episode-01.mkv' },
      { id: '02', name: '第二集', path: '/library/episode-02.mkv' },
    ]

    expect(
      resolvePlaylistNeighbors(playlist, {
        kind: 'electron-file',
        path: '/library/episode-01.mkv',
        hash: 'hash',
        name: 'episode-01.mkv',
        size: 1,
      }),
    ).toEqual({
      currentIndex: 0,
      previous: undefined,
      next: playlist[1],
    })
  })
})
