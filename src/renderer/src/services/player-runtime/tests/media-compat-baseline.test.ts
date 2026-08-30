import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleCustomProtocol } from '../../../../../main/lib/protocols'
import { loadHistoricalVideo } from '../../player-loading/load-history'
import { resolvePlaylistNeighbors } from '../history/playlist'
import { toEmbeddedSubtitleTrack } from '../platform/embedded-subtitle'
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
  it('electron 直放继续通过 marchen 协议提供单区间 Range', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'marchen-direct-baseline-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'direct.mp4')
    await writeFile(filePath, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]))

    const response = await handleCustomProtocol(
      filePath,
      new Request('marchen:///direct.mp4', { headers: { Range: 'bytes=2-5' } }),
    )

    expect(response.status).toBe(206)
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/8')
    expect(response.headers.get('Content-Length')).toBe('4')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([2, 3, 4, 5])
  })

  it('electron 直放当前不接受没有 Range 的请求', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'marchen-range-baseline-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'direct.mkv')
    await writeFile(filePath, Buffer.from([0, 1, 2, 3]))

    const response = await handleCustomProtocol(filePath, new Request('marchen:///direct.mkv'))

    expect(response.status).toBe(416)
  })

  it('web 直放为本地文件创建独立 Blob URL，并由 handle 释放', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:web-direct')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const lifecycle = createWebSourceLifecyclePort()
    const file = new File(['video'], 'direct.mp4', { type: 'video/mp4' })

    const handle = await lifecycle.prepare({
      kind: 'web-file',
      file,
      hash: 'direct-hash',
      name: file.name,
      size: file.size,
    })
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
          path: '/library/episode-01.mkv',
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

  it('内嵌字幕使用字幕轨道相对索引，不复用全文件 stream index', () => {
    expect(
      toEmbeddedSubtitleTrack({ index: 7, tags: { title: '简体中文', language: 'zho' } }, 1),
    ).toEqual({
      id: 'embedded:1',
      title: '简体中文',
      language: 'zho',
      origin: 'embedded',
    })
  })
})
