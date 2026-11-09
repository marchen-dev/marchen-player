import type { DurableMediaSource } from '@marchen/shared/media'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MatroskaSubtitles } from '../../media/subtitles/matroska'
import { PgsSubtitleSession } from '../../media/subtitles/pgs/session'
import { listEmbeddedSubtitles, resolveEmbeddedTrack } from '../platform/embedded-catalog'
import { openPlaybackResource } from '../platform/media-resource'
import { createWebSourceLifecyclePort, createWebSubtitleCatalogPort } from '../platform/web'
import { embeddedSubtitlesAvailable } from '../subtitles/source-policy'
import { asText } from './subtitle-track'

vi.mock('../platform/media-resource', () => ({ openPlaybackResource: vi.fn() }))
vi.mock('../../media/subtitles/matroska', () => ({
  MatroskaSubtitles: {
    open: vi.fn(async () => ({
      tracks: [{ number: 1, uid: '1', codec: 'S_TEXT/UTF8', supported: true, title: '中文' }],
    })),
  },
}))
vi.mock('../../media/subtitles/resolve', () => ({
  resolveEmbeddedSubtitle: vi.fn(async () => ({ url: 'blob:embedded' })),
}))
vi.mock('../../media/subtitles/pgs/session', () => ({
  PgsSubtitleSession: { open: vi.fn() },
}))
const remote: DurableMediaSource = {
  kind: 'remote-url',
  hash: 'remote:test',
  name: 'sample.mkv',
  size: 100,
  url: 'https://example.test/sample.mkv',
}
const track = {
  id: 'embedded:1',
  title: '中文',
  origin: 'embedded' as const,
  embedded: { number: 1, uid: '1', codec: 'S_TEXT/UTF8' },
}

describe('内嵌字幕来源限制', () => {
  beforeEach(() => vi.clearAllMocks())

  it('远程目录和旧轨道解析均不创建字幕媒体资源', async () => {
    expect(await listEmbeddedSubtitles(remote)).toEqual([])
    await expect(resolveEmbeddedTrack(remote, track)).rejects.toThrow('远程视频暂不支持内嵌字幕')
    expect(openPlaybackResource).not.toHaveBeenCalled()
  })

  it.each(['electron-file', 'web-file'] as const)('保留 %s 的内嵌路径及资源释放', async (kind) => {
    const release = vi.fn()
    const close = vi.fn()
    vi.mocked(openPlaybackResource).mockResolvedValue({
      acquire: () => ({ source: { size: 100, read: vi.fn() }, release }),
      close,
    } as unknown as Awaited<ReturnType<typeof openPlaybackResource>>)
    const source: DurableMediaSource =
      kind === 'electron-file'
        ? { kind, hash: 'local', name: 'sample.mkv', size: 100, path: '/sample.mkv' }
        : {
            kind,
            hash: 'local',
            name: 'sample.mkv',
            size: 100,
            file: new File(['video'], 'sample.mkv'),
          }
    expect(await listEmbeddedSubtitles(source)).toContainEqual(
      expect.objectContaining({ id: 'embedded:1' }),
    )
    expect(await resolveEmbeddedTrack(source, track)).toMatchObject({ url: 'blob:embedded' })
    expect(openPlaybackResource).toHaveBeenCalledTimes(2)
    expect(release).toHaveBeenCalledTimes(2)
    expect(close).toHaveBeenCalledTimes(2)
  })

  it('远程 Web 目录仍可导入、读取和恢复外挂，旧内嵌描述不能绕过', async () => {
    const lifecycle = createWebSourceLifecyclePort()
    const catalog = createWebSubtitleCatalogPort(
      lifecycle,
      async () => new File(['1\n00:00:01,000 --> 00:00:03,000\n外挂字幕'], '字幕.srt'),
    )
    expect(await catalog.list(remote)).toEqual([])
    const external = await catalog.importExternal()
    expect(external).not.toBeNull()
    expect(await catalog.list(remote)).toHaveLength(1)
    const resolved = await catalog.resolve(remote, external!)
    expect(await (await fetch(asText(resolved).url)).text()).toContain('外挂字幕')
    const restored = await catalog.restoreExternal(
      undefined,
      '字幕.srt',
      'history:-2',
      asText(external).persistenceContent,
    )
    expect(await (await fetch(asText(restored).url)).text()).toContain('外挂字幕')
    await expect(catalog.resolve(remote, track)).rejects.toThrow('远程视频暂不支持内嵌字幕')
    expect(openPlaybackResource).not.toHaveBeenCalled()
    resolved.release?.()
    restored.release?.()
    lifecycle.dispose()
  })

  it.each([
    ['本地文件', { kind: 'electron-file', path: '/sample.mkv' }, true],
    ['Jellyfin', { kind: 'provider-item', provider: 'jellyfin', sourceId: 's', itemRef: 'i' }, true],
    ['Emby', { kind: 'provider-item', provider: 'emby', sourceId: 's', itemRef: 'i' }, true],
    ['WebDAV', { kind: 'provider-item', provider: 'webdav', sourceId: 's', itemRef: 'a.mkv' }, false],
    ['远程直链', { kind: 'remote-url', url: 'https://example.test/sample.mkv' }, false],
  ] as const)('%s 的内嵌字幕可用性提示判定', (_, partial, expected) => {
    const source = { hash: 'h', name: 'sample.mkv', size: 100, ...partial } as DurableMediaSource
    expect(embeddedSubtitlesAvailable(source)).toBe(expected)
  })

  const local: DurableMediaSource = {
    kind: 'electron-file',
    hash: 'local',
    name: 'sample.mkv',
    size: 100,
    path: '/sample.mkv',
  }
  const pgs = {
    id: 'embedded:6',
    title: 'chs&jpn',
    origin: 'embedded' as const,
    kind: 'bitmap' as const,
    embedded: { number: 6, uid: '9', codec: 'S_HDMV/PGS' },
  }
  const bitmapResource = () => {
    const leaseRelease = vi.fn()
    const close = vi.fn()
    const compatSource = { kind: 'url' as const, url: 'marchen://media/lease' }
    vi.mocked(openPlaybackResource).mockResolvedValue({
      compat: () => ({ source: compatSource, assetBase: '', release: leaseRelease }),
      metadata: { isHdrVideo: async () => true },
      close,
    } as unknown as Awaited<ReturnType<typeof openPlaybackResource>>)
    return { leaseRelease, close, compatSource }
  }

  it('远程来源的图片字幕不创建资源也不打开会话', async () => {
    await expect(resolveEmbeddedTrack(remote, pgs)).rejects.toThrow('远程视频暂不支持内嵌字幕')
    expect(openPlaybackResource).not.toHaveBeenCalled()
    expect(PgsSubtitleSession.open).not.toHaveBeenCalled()
  })

  it('图片字幕会话持有读取租约，关闭字幕时才释放', async () => {
    const { leaseRelease, close, compatSource } = bitmapResource()
    const session = { close: vi.fn(async () => undefined) }
    let release: (() => void) | undefined
    vi.mocked(PgsSubtitleSession.open).mockImplementation(async (_source, _track, options) => {
      release = options.release
      return session as unknown as PgsSubtitleSession
    })
    const controller = new AbortController()
    const resolved = await resolveEmbeddedTrack(local, pgs, controller.signal)
    expect(resolved).toMatchObject({ kind: 'bitmap', session })
    expect(PgsSubtitleSession.open).toHaveBeenCalledWith(
      compatSource,
      pgs.embedded,
      expect.objectContaining({ hdrHint: true }),
    )
    // 打开完成后取消原请求，不影响正在使用的会话
    controller.abort()
    const lifetime = vi.mocked(openPlaybackResource).mock.calls[0][1]
    expect(lifetime.aborted).toBe(false)
    expect(close).not.toHaveBeenCalled()
    resolved.release?.()
    expect(session.close).toHaveBeenCalled()
    // 会话关闭后由会话调用 release，释放兼容租约与资源，重复调用无副作用
    release?.()
    release?.()
    expect(leaseRelease).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('会话打开失败时立即释放资源', async () => {
    const { leaseRelease, close } = bitmapResource()
    vi.mocked(PgsSubtitleSession.open).mockRejectedValue(new Error('字幕索引读取超时'))
    await expect(resolveEmbeddedTrack(local, pgs)).rejects.toThrow('超时')
    expect(leaseRelease).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('目录标出图片字幕类型与不支持原因', async () => {
    vi.mocked(openPlaybackResource).mockResolvedValue({
      acquire: () => ({ source: { size: 100, read: vi.fn() }, release: vi.fn() }),
      close: vi.fn(),
    } as unknown as Awaited<ReturnType<typeof openPlaybackResource>>)
    vi.mocked(MatroskaSubtitles.open).mockResolvedValueOnce({
      tracks: [
        { number: 6, uid: '9', codec: 'S_HDMV/PGS', kind: 'bitmap', supported: true, title: 'chs' },
        { number: 7, uid: '8', codec: 'S_VOBSUB', kind: 'text', supported: false, unsupportedCode: 'bitmap_codec', title: 'dvd' },
        { number: 8, uid: '7', codec: 'S_HDMV/PGS', kind: 'bitmap', supported: false, unsupportedCode: 'missing_index', title: 'old' },
      ],
    } as unknown as MatroskaSubtitles)
    const tracks = await listEmbeddedSubtitles(local)
    expect(tracks.map(({ title, kind, supported }) => ({ title, kind, supported }))).toEqual([
      { title: 'chs', kind: 'bitmap', supported: true },
      { title: 'dvd（图片字幕，暂不支持）', kind: 'text', supported: false },
      { title: 'old（图片字幕，文件缺少索引）', kind: 'bitmap', supported: false },
    ])
  })
})
