import type { DB_History } from '@renderer/database/schemas/history'
import { markNextPlayerImportSource } from '@renderer/services/telemetry/player-loading-observer'

import { describe, expect, it, vi } from 'vitest'
import { loadHistoricalVideo, parseHistoricalImportSource } from './load-history'

vi.mock('@renderer/services/telemetry/player-loading-observer', () => ({
  markNextPlayerImportSource: vi.fn(),
}))

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
      history: {
        get: vi.fn(async () =>
          history({ source: { kind: 'electron-file', path: '  ', name: 'test.mkv', size: 1 } }),
        ),
      },
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

  it('未指定入口时导入来源记为影视库，指定后按入口记录', async () => {
    const deps = {
      history: { get: vi.fn(async () => history()) },
      service: { loadFromPath: vi.fn() },
    }

    await loadHistoricalVideo('video-hash', deps)
    expect(markNextPlayerImportSource).toHaveBeenLastCalledWith('library')

    await loadHistoricalVideo('video-hash', { ...deps, importSource: 'history' })
    expect(markNextPlayerImportSource).toHaveBeenLastCalledWith('history')
  })

  it('路由 state 中不认识的来源回退到影视库', () => {
    expect(parseHistoricalImportSource('history')).toBe('history')
    expect(parseHistoricalImportSource('library')).toBe('library')
    expect(parseHistoricalImportSource('click')).toBe('library')
    expect(parseHistoricalImportSource(undefined)).toBe('library')
  })
})

function history(overrides: Partial<DB_History> = {}): DB_History {
  return {
    hash: 'video-hash',
    source: { kind: 'electron-file', path: '/video/test.mkv', name: 'test.mkv', size: 1 },
    progress: 30,
    duration: 100,
    updatedAt: '2026-08-30T00:00:00.000Z',
    ...overrides,
  }
}

vi.mock('@renderer/lib/utils', () => ({ isWeb: true }))

it('web 旧远程历史不再发起网络视频加载', async () => {
  const record = history()
  record.source = {
    kind: 'remote-url',
    hash: record.hash,
    name: 'a.mkv',
    size: 32,
    url: 'https://example.com/a.mkv',
  }
  const loadFromUrl = vi.fn()
  const result = await loadHistoricalVideo(record.hash, {
    history: { get: async () => record },
    service: { loadFromPath: vi.fn(), loadFromUrl },
  })
  expect(result.status).toBe('error')
  if (result.status === 'error') expect(String(result.error)).toContain('网页版不支持远程视频')
  expect(loadFromUrl).not.toHaveBeenCalled()
})
