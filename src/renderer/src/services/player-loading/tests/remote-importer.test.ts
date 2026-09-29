import { jotaiStore } from '@renderer/atoms/store'
import { releaseRemoteImport, takeRemoteImport } from '@renderer/services/media/remote-handoff'
import { remoteImportProgressAtom } from '@renderer/services/media/remote-progress'
import { describe, expect, it, vi } from 'vitest'
import { importRemoteVideo } from '../adapters/remote-importer'
const mocks = vi.hoisted(() => ({ get: vi.fn(), open: vi.fn() }))
vi.mock('@renderer/database/db', () => ({ db: { history: { get: mocks.get } } }))
vi.mock('@renderer/services/media/remote-source', () => ({ openRemoteSource: mocks.open }))
const bytes = new Uint8Array([1, 2, 3])
function source() {
  return { size: 3, name: 'video.mp4', read: vi.fn(async () => bytes), close: vi.fn() }
}
describe('网络视频内容身份', () => {
  it('独立记录键不能冒充文件 hash，来源交接不改变持久化身份', async () => {
    const range = source()
    mocks.open.mockResolvedValueOnce(range)
    const result = await importRemoteVideo('https://example.com/video?token=a')
    expect(result.hash).toMatch(/^remote:/)
    expect(result.matchHash).toMatch(/^[a-f0-9]{32}$/)
    expect(result.source).toMatchObject({ url: 'https://example.com/video?token=a' })
    expect(range.close).not.toHaveBeenCalled()
    const controller = new AbortController()
    const resource = takeRemoteImport(result.source, controller.signal)
    expect(resource).toBeDefined()
    releaseRemoteImport(result.source)
    expect(range.close).not.toHaveBeenCalled()
    resource?.close()
    expect(range.close).toHaveBeenCalledOnce()
  })
  it('更换同内容链接沿用旧记录，不一致或无指纹时拒绝覆盖', async () => {
    mocks.open.mockImplementation(async () => source())
    const first = await importRemoteVideo('https://example.com/a')
    mocks.get.mockResolvedValue({ source: first.source })
    const replaced = await importRemoteVideo('https://example.com/b', first.hash)
    expect(replaced.hash).toBe(first.hash)
    mocks.get.mockResolvedValue({ source: { ...first.source, size: 4 } })
    await expect(importRemoteVideo('https://example.com/c', first.hash)).rejects.toThrow('无法确认')
    mocks.get.mockResolvedValue({ source: { ...first.source, fingerprint: undefined } })
    await expect(importRemoteVideo('https://example.com/c', first.hash)).rejects.toThrow('无法确认')
  })
  it('首次前缀读取失败可以无自动匹配播放，取消则不能完成导入', async () => {
    const range = source()
    range.read.mockRejectedValue(new Error('断网'))
    mocks.open.mockResolvedValue(range)
    const first = await importRemoteVideo('https://example.com/a')
    expect(first.matchHash).toBeUndefined()
    const controller = new AbortController()
    controller.abort()
    await expect(
      importRemoteVideo('https://example.com/a', undefined, controller.signal),
    ).rejects.toBeDefined()
  })
})

it('导入期间发布识别进度，结束后清理且复用读取不再更新导入状态', async () => {
  let report!: (received: number, total: number) => void
  const range = source()
  mocks.open.mockImplementationOnce(async (_url, _signal, onProgress) => {
    report = onProgress
    expect(jotaiStore.get(remoteImportProgressAtom)?.stage).toBe('connecting')
    range.read.mockImplementationOnce(async () => {
      report(0, 3)
      expect(jotaiStore.get(remoteImportProgressAtom)).toMatchObject({
        stage: 'reading',
        received: 0,
        total: 3,
      })
      report(3, 3)
      expect(jotaiStore.get(remoteImportProgressAtom)?.received).toBe(3)
      return bytes
    })
    return range
  })
  const result = await importRemoteVideo('https://example.com/progress.mp4')
  expect(jotaiStore.get(remoteImportProgressAtom)).toBeNull()
  report(1, 3)
  expect(jotaiStore.get(remoteImportProgressAtom)).toBeNull()
  releaseRemoteImport(result.source)
})
