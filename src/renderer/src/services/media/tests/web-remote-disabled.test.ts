import { describe, expect, it, vi } from 'vitest'
import { WebImporter } from '../../player-loading/adapters/web-importer'
import { openRemoteSource } from '../remote-source'
vi.mock('@renderer/lib/client', () => ({ ipcClient: null }))
vi.mock('../../player-loading/file-playlist', () => ({ rememberWebFile: vi.fn() }))
describe('web 远程视频边界', () => {
  it('内部读取入口和导入器均在网络请求前拒绝', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    try {
      await expect(
        openRemoteSource('https://example.com/a.mkv', new AbortController().signal),
      ).rejects.toThrow('网页版不支持远程视频')
      await expect(new WebImporter().importFromUrl()).rejects.toThrow('网页版不支持远程视频')
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      fetch.mockRestore()
    }
  })
})
