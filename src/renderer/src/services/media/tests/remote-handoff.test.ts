import type { RemoteMediaSource } from '@marchen/shared/media'
import type { openRemoteSource } from '../remote-source'
import { describe, expect, it, vi } from 'vitest'
import { releaseRemoteImport, retainRemoteImport, takeRemoteImport } from '../remote-handoff'

const source = (): RemoteMediaSource => ({
  kind: 'remote-url',
  hash: 'remote:1',
  size: 32,
  name: 'a.mkv',
  url: 'https://example.com/a',
})
const resource = () =>
  ({
    close: vi.fn(),
    size: 32,
    name: 'a.mkv',
    nativeUrl: 'marchen://media/test',
    internal: true,
    read: vi.fn(),
  }) satisfies Awaited<ReturnType<typeof openRemoteSource>>

describe('远程导入租约交接', () => {
  it('播放宿主重挂载仍能复用，会话和播放引用均释放后关闭', () => {
    const s = source();
      const r = resource();
      const controller = new AbortController()
    retainRemoteImport(s, r)
    expect(takeRemoteImport(s, controller.signal)?.nativeUrl).toBe(r.nativeUrl)
    const remount = takeRemoteImport(s, new AbortController().signal)
    expect(remount).toBeDefined()
    remount?.close()
    releaseRemoteImport(s)
    expect(r.close).not.toHaveBeenCalled()
    controller.abort()
    expect(r.close).toHaveBeenCalledOnce()
  })
  it('取消尚未领取的来源会释放；同 hash 新对象不能误取旧租约', () => {
    const s = source();
      const r = resource()
    retainRemoteImport(s, r)
    expect(takeRemoteImport(source(), new AbortController().signal)).toBeUndefined()
    releaseRemoteImport(s)
    releaseRemoteImport(s)
    expect(r.close).toHaveBeenCalledOnce()
  })
})
