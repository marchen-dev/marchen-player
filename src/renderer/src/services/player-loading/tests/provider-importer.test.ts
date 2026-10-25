import { providerHistoryKey } from '@marchen/shared/media'
import { MediaSourceError } from '@marchen/shared/media-sources'
import { releaseRemoteImport } from '@renderer/services/media/remote-handoff'
import { describe, expect, it, vi } from 'vitest'
import { importProviderVideo } from '../adapters/provider-importer'

const mocks = vi.hoisted(() => ({ get: vi.fn(), remove: vi.fn(), open: vi.fn() }))
vi.mock('@renderer/database/db', () => ({
  db: { history: { get: mocks.get, delete: mocks.remove } },
}))
vi.mock('@renderer/services/media/provider-source', () => ({ openProviderSource: mocks.open }))
vi.mock('@renderer/components/ui/toast', () => ({ toast: vi.fn() }))

const bytes = new Uint8Array([1, 2, 3])
const range = (size = 3) => ({
  size,
  name: '[Sub] Frieren - 01.mkv',
  kind: 'jellyfin' as const,
  read: vi.fn(async () => bytes),
  close: vi.fn(),
})

describe('媒体源条目导入', () => {
  it('使用确定性主键，文件名来自来源，不保存播放地址', async () => {
    mocks.get.mockResolvedValue(undefined)
    mocks.open.mockResolvedValueOnce(range())
    const result = await importProviderVideo('src-1', 'item-1')
    expect(result.hash).toBe(providerHistoryKey('src-1', 'item-1'))
    expect(result.name).toBe('[Sub] Frieren - 01.mkv')
    expect(result.matchHash).toMatch(/^[a-f0-9]{32}$/)
    expect(result.source).toMatchObject({
      kind: 'provider-item',
      provider: 'jellyfin',
      sourceId: 'src-1',
      itemRef: 'item-1',
    })
    expect(JSON.stringify(result.source)).not.toContain('marchen://')
    releaseRemoteImport(result.source)
  })

  it('内容一致时沿用旧记录', async () => {
    mocks.open.mockImplementation(async () => range())
    mocks.get.mockResolvedValue(undefined)
    const first = await importProviderVideo('src-1', 'item-1')
    mocks.get.mockResolvedValue({ source: first.source })
    mocks.remove.mockClear()
    const again = await importProviderVideo('src-1', 'item-1')
    expect(again.hash).toBe(first.hash)
    expect(mocks.remove).not.toHaveBeenCalled()
    releaseRemoteImport(first.source)
    releaseRemoteImport(again.source)
  })

  it('内容变化时清空旧记录后作为新视频继续', async () => {
    mocks.open.mockImplementation(async () => range())
    mocks.get.mockResolvedValue(undefined)
    const first = await importProviderVideo('src-1', 'item-1')
    mocks.get.mockResolvedValue({
      source: { ...first.source, fingerprint: { algorithm: 'md5-prefix-16m', value: 'other' } },
    })
    mocks.remove.mockClear()
    const changed = await importProviderVideo('src-1', 'item-1')
    expect(mocks.remove).toHaveBeenCalledWith(first.hash)
    expect(changed.hash).toBe(first.hash)
    mocks.get.mockResolvedValue({ source: { ...first.source, size: 99 } })
    mocks.remove.mockClear()
    releaseRemoteImport(changed.source)
    const resized = await importProviderVideo('src-1', 'item-1')
    expect(mocks.remove).toHaveBeenCalledOnce()
    releaseRemoteImport(first.source)
    releaseRemoteImport(resized.source)
  })

  it('内容变化且没读到新指纹时，不沿用旧指纹，下次读到指纹也不会再误删', async () => {
    mocks.open.mockImplementation(async () => range())
    mocks.get.mockResolvedValue(undefined)
    const first = await importProviderVideo('src-1', 'item-1')
    // 服务器换成了更大的文件，这次识别前缀读取失败，拿不到新指纹
    const unread = { ...range(99), read: vi.fn(async () => Promise.reject(new Error('timeout'))) }
    mocks.open.mockResolvedValueOnce(unread)
    mocks.get.mockResolvedValue({ source: first.source })
    const replaced = await importProviderVideo('src-1', 'item-1')
    expect(replaced.source).toMatchObject({ kind: 'provider-item', fingerprint: undefined })
    // 下次打开同一个新文件，读到了指纹：大小一致且旧记录没有指纹，不能再判为变化
    mocks.open.mockResolvedValueOnce(range(99))
    mocks.get.mockResolvedValue({ source: replaced.source })
    mocks.remove.mockClear()
    const reopened = await importProviderVideo('src-1', 'item-1')
    expect(mocks.remove).not.toHaveBeenCalled()
    releaseRemoteImport(first.source)
    releaseRemoteImport(replaced.source)
    releaseRemoteImport(reopened.source)
  })

  it('打开失败保留稳定错误码', async () => {
    mocks.open.mockRejectedValueOnce(new MediaSourceError('source_removed'))
    await expect(importProviderVideo('gone', 'item')).rejects.toMatchObject({
      code: 'source_removed',
    })
  })
})
