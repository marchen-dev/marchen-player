import type { DB_History } from '@renderer/database/schemas/history'
import { describe, expect, it, vi } from 'vitest'

import { loadHistoricalVideo } from './load-history'

describe('历史视频共享加载动作', () => {
  it('根据 hash 找到 path，并且只向 service 发出一次加载', async () => {
    const get = vi.fn(async () => history())
    const loadFromPath = vi.fn()

    const result = await loadHistoricalVideo('video-hash', {
      history: { get },
      service: { loadFromPath },
    })

    expect(get).toHaveBeenCalledOnce()
    expect(get).toHaveBeenCalledWith('video-hash')
    expect(loadFromPath).toHaveBeenCalledOnce()
    expect(loadFromPath).toHaveBeenCalledWith('/video/test.mkv')
    expect(result).toEqual({ status: 'loaded', path: '/video/test.mkv' })
  })

  it('记录不存在时不触发加载', async () => {
    const loadFromPath = vi.fn()
    const result = await loadHistoricalVideo('missing', {
      history: { get: vi.fn(async () => undefined) },
      service: { loadFromPath },
    })

    expect(result).toEqual({ status: 'missing-record' })
    expect(loadFromPath).not.toHaveBeenCalled()
  })

  it('记录没有 path 时不触发加载', async () => {
    const loadFromPath = vi.fn()
    const result = await loadHistoricalVideo('missing-path', {
      history: { get: vi.fn(async () => history({ path: '  ' })) },
      service: { loadFromPath },
    })

    expect(result).toEqual({ status: 'missing-path' })
    expect(loadFromPath).not.toHaveBeenCalled()
  })

  it('数据库读取与 service 调用错误都返回 error 供界面反馈', async () => {
    const databaseError = new Error('database failed')
    const databaseResult = await loadHistoricalVideo('failed-db', {
      history: {
        get: vi.fn(async () => {
          throw databaseError
        }),
      },
      service: { loadFromPath: vi.fn() },
    })

    const serviceError = new Error('file missing')
    const serviceResult = await loadHistoricalVideo('failed-service', {
      history: { get: vi.fn(async () => history()) },
      service: {
        loadFromPath: vi.fn(() => {
          throw serviceError
        }),
      },
    })

    expect(databaseResult).toEqual({ status: 'error', error: databaseError })
    expect(serviceResult).toEqual({ status: 'error', error: serviceError })
  })
})

function history(overrides: Partial<DB_History> = {}): DB_History {
  return {
    hash: 'video-hash',
    path: '/video/test.mkv',
    progress: 30,
    duration: 100,
    updatedAt: '2026-08-30T00:00:00.000Z',
    ...overrides,
  }
}
