import type { DurableMediaSource } from '@marchen/shared/media'
import { providerHistoryKey } from '@marchen/shared/media'
import { describe, expect, it, vi } from 'vitest'
import { createElectronSubtitleCatalogPort } from '../platform/electron'
import { listEmbeddedSubtitles } from '../platform/embedded-catalog'
import { supportsEmbeddedSubtitles } from '../subtitles/source-policy'

const ipc = vi.hoisted(() => ({
  subtitles: vi.fn(),
  readSubtitle: vi.fn(),
}))
vi.mock('@renderer/lib/client', () => ({
  ipcClient: { mediaSources: ipc, setting: { getWindowIsFullScreen: async () => false } },
  handlers: null,
}))
vi.mock('../platform/media-resource', () => ({ openPlaybackResource: vi.fn() }))
vi.mock('@renderer/services/player-loading/index', () => ({ getPlayerLoadingService: vi.fn() }))
vi.mock('../../media/frame-queue', () => ({ mediaFrameQueue: { request: vi.fn() } }))

const source: DurableMediaSource = {
  kind: 'provider-item',
  hash: providerHistoryKey('s', 'ep'),
  sourceId: 's',
  provider: 'jellyfin',
  itemRef: 'ep',
  name: 'ep.mkv',
  size: 1,
}

describe('媒体源字幕', () => {
  it('不在本地提取内嵌字幕', async () => {
    expect(supportsEmbeddedSubtitles(source)).toBe(false)
    expect(await listEmbeddedSubtitles(source)).toEqual([])
  })

  it('列出服务端字幕，带稳定的持久化标识；选中后读取正文', async () => {
    ipc.subtitles.mockResolvedValue({
      ok: true,
      value: [{ id: '4', title: 'English', format: 'srt', language: 'eng' }],
    })
    ipc.readSubtitle.mockResolvedValue({
      ok: true,
      value: '1\n00:00:01,000 --> 00:00:02,000\nHello\n',
    })
    const catalog = createElectronSubtitleCatalogPort()
    const [track] = await catalog.list(source)
    expect(track).toMatchObject({
      id: 'provider:4',
      origin: 'external',
      persistenceKey: 'provider:4',
    })
    const resolved = await catalog.resolve(source, track)
    expect(ipc.readSubtitle).toHaveBeenCalledWith({ sourceId: 's', itemRef: 'ep', subtitleId: '4' })
    expect(resolved.persistencePath).toBe('provider:4')
    expect(resolved.url).toMatch(/^blob:/)
    resolved.release?.()
  })

  it('列表失败不抛错，字幕读取失败给出提示', async () => {
    ipc.subtitles.mockResolvedValueOnce({ ok: false, code: 'unreachable', message: '无法连接' })
    const catalog = createElectronSubtitleCatalogPort()
    expect(await catalog.list(source)).toEqual([])
    ipc.subtitles.mockResolvedValueOnce({
      ok: true,
      value: [{ id: '2', title: '中文', format: 'ass' }],
    })
    const [track] = await catalog.list(source)
    ipc.readSubtitle.mockResolvedValueOnce({
      ok: false,
      code: 'unreachable',
      message: '无法连接服务器',
    })
    await expect(catalog.resolve(source, track)).rejects.toThrow('无法连接服务器')
    await expect(catalog.restoreExternal('provider:2', '中文')).rejects.toThrow('媒体源字幕')
  })
})
