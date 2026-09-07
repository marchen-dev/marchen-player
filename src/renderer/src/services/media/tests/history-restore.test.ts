import { calculateFileHash } from '@marchen/shared/lib/calc-file-hash'
import { expect, it, vi } from 'vitest'
import { loadHistoricalVideo } from '../../player-loading/load-history'
vi.mock('@renderer/database/db', () => ({ db: { history: {} } }))
vi.mock('@renderer/services/telemetry/player-loading-observer', () => ({
  markNextPlayerImportSource: vi.fn(),
}))

it('web 重新选择同一内容时按原 hash 加载，取消不触发加载', async () => {
  const file = new File(['video bytes'], 'renamed.mkv')
  const hash = await calculateFileHash(file)
  const history = {
    get: async () => ({
      hash,
      source: { kind: 'web-file' as const, name: 'old.mkv', size: file.size },
      progress: 42,
      duration: 100,
      updatedAt: '',
    }),
  }
  const service = { loadFromPath: vi.fn(), loadFromFile: vi.fn() }
  expect(
    (await loadHistoricalVideo(hash, { history, service, selectFile: async () => file })).status,
  ).toBe('loaded')
  expect(service.loadFromFile).toHaveBeenCalledWith(file)
  expect(
    await loadHistoricalVideo(hash, { history, service, selectFile: async () => null }),
  ).toEqual({ status: 'cancelled' })
  expect(service.loadFromFile).toHaveBeenCalledTimes(1)
})
it('同大小不同内容不恢复旧影片进度', async () => {
  const history = {
    get: async () => ({
      hash: 'expected',
      source: { kind: 'web-file' as const, name: 'old.mkv', size: 4 },
      progress: 42,
      duration: 100,
      updatedAt: '',
    }),
  }
  const service = { loadFromPath: vi.fn(), loadFromFile: vi.fn() }
  expect(
    (
      await loadHistoricalVideo('expected', {
        history,
        service,
        selectFile: async () => new File(['abcd'], 'old.mkv'),
      })
    ).status,
  ).toBe('error')
  expect(service.loadFromFile).not.toHaveBeenCalled()
})
