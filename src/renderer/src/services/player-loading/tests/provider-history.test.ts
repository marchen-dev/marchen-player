import type { DB_History } from '@renderer/database/schemas/history'
import { providerHistoryKey } from '@marchen/shared/media'
import { describe, expect, it, vi } from 'vitest'
import { loadHistoricalVideo } from '../load-history'

vi.mock('@renderer/lib/utils', () => ({ isWeb: false }))
vi.mock('@renderer/services/telemetry/player-loading-observer', () => ({
  markNextPlayerImportSource: vi.fn(),
}))

const hash = providerHistoryKey('src-1', 'item-1')
const record: DB_History = {
  hash,
  source: {
    kind: 'provider-item',
    hash,
    sourceId: 'src-1',
    provider: 'jellyfin',
    itemRef: 'item-1',
    name: 'EP01.mkv',
    size: 1,
  },
  progress: 10,
  duration: 100,
  updatedAt: '2026-10-25T00:00:00.000Z',
}

describe('媒体源历史续播', () => {
  it('通过原来源重新打开条目', async () => {
    const loadFromProvider = vi.fn()
    const result = await loadHistoricalVideo(hash, {
      history: { get: async () => record },
      service: { loadFromPath: vi.fn(), loadFromProvider },
      hasMediaSource: async () => true,
    })
    expect(result).toEqual({ status: 'loaded', path: 'EP01.mkv' })
    expect(loadFromProvider).toHaveBeenCalledWith('src-1', 'item-1')
  })

  it('来源已移除时提示且不加载，记录保持不变', async () => {
    const loadFromProvider = vi.fn()
    const result = await loadHistoricalVideo(hash, {
      history: { get: async () => record },
      service: { loadFromPath: vi.fn(), loadFromProvider },
      hasMediaSource: async () => false,
    })
    expect(result.status).toBe('error')
    if (result.status === 'error') expect(result.error).toMatchObject({ code: 'source_removed' })
    expect(loadFromProvider).not.toHaveBeenCalled()
  })
})
