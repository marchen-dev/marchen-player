import type { RemoteMediaSource } from '@marchen/shared/media'
import { expect, it, vi } from 'vitest'
import { openPlaybackResource } from '../../player-runtime/platform/media-resource'
import { releaseRemoteImport, retainRemoteImport } from '../remote-handoff'
const mocks = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('../remote-source', () => ({ openRemoteSource: mocks.open }))

it('缩略图独立打开不领取导入租约，主播放随后仍能复用', async () => {
  const source: RemoteMediaSource = {
    kind: 'remote-url',
    hash: 'remote:test',
    name: 'a.mkv',
    size: 32,
    url: 'https://example.com/a',
  }
  const resource = (url: string) => ({
    size: 32,
    name: 'a.mkv',
    read: vi.fn(),
    close: vi.fn(),
    internal: true,
    nativeUrl: url,
  })
  const imported = resource('marchen://media/imported')
  const thumbnail = resource('marchen://media/thumbnail')
  retainRemoteImport(source, imported)
  mocks.open.mockResolvedValueOnce(thumbnail)
  const auxiliary = await openPlaybackResource(source, new AbortController().signal)
  auxiliary.close()
  expect(imported.close).not.toHaveBeenCalled()
  const primary = await openPlaybackResource(source, new AbortController().signal, true)
  expect(primary.url).toBe(imported.nativeUrl)
  expect(mocks.open).toHaveBeenCalledTimes(1)
  releaseRemoteImport(source)
  expect(imported.close).not.toHaveBeenCalled()
  primary.close()
  expect(imported.close).toHaveBeenCalledOnce()
})
