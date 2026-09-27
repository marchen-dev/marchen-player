import type { DurableMediaSource } from '@marchen/shared/media'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listEmbeddedSubtitles, resolveEmbeddedTrack } from '../platform/embedded-catalog'
import { openPlaybackResource } from '../platform/media-resource'
import { createWebSourceLifecyclePort, createWebSubtitleCatalogPort } from '../platform/web'

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
    expect(await (await fetch(resolved.url)).text()).toContain('外挂字幕')
    const restored = await catalog.restoreExternal(
      undefined,
      '字幕.srt',
      'history:-2',
      external!.persistenceContent,
    )
    expect(await (await fetch(restored.url)).text()).toContain('外挂字幕')
    await expect(catalog.resolve(remote, track)).rejects.toThrow('远程视频暂不支持内嵌字幕')
    expect(openPlaybackResource).not.toHaveBeenCalled()
    resolved.release?.()
    restored.release?.()
    lifecycle.dispose()
  })
})
