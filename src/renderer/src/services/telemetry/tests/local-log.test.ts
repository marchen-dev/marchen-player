import { describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/lib/client', () => ({ ipcClient: null }))

const { createLocalLogTelemetryClient, levelOfEvent, readWebLocalLog, writeLocalLog } =
  await import('../local-log')

const readEntries = () =>
  readWebLocalLog()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

const common = {
  release: 'Marchen@1.0.1',
  dist: 'mac',
  version: '1.0.1',
  commit: 'abc',
  environment: 'production' as const,
  app_target: 'electron' as const,
  runtime: 'renderer' as const,
  platform: 'darwin',
  arch: 'arm64',
  app_session_id: 'session',
}

describe('levelOfEvent', () => {
  it('失败事件为 error，卡顿与失败结果为 warn，其余 info', () => {
    expect(levelOfEvent('playback_failed', {})).toBe('error')
    expect(levelOfEvent('playback_stalled', {})).toBe('warn')
    expect(levelOfEvent('remote_import_result', { result: 'failure' })).toBe('warn')
    expect(levelOfEvent('playback_started', {})).toBe('info')
  })
})

describe('createLocalLogTelemetryClient', () => {
  it('写入前剔除公共属性，并用 operation_id 作为关联 ID', () => {
    const client = createLocalLogTelemetryClient()
    client.capture('playback_failed', { ...common, operation_id: 'op_1', error_code: 'decode' })
    const entry = readEntries().at(-1)
    expect(entry).toMatchObject({ lv: 'error', cat: 'player', msg: 'playback_failed', op: 'op_1' })
    expect(entry.data).toEqual({ operation_id: 'op_1', error_code: 'decode' })
  })

  it('captureException 记录错误信息与错误码', () => {
    const client = createLocalLogTelemetryClient()
    client.captureException(new Error('boom'), { errorCode: 'X', mechanism: 'subtitle' })
    expect(readEntries().at(-1)).toMatchObject({
      lv: 'error',
      cat: 'subtitle',
      data: { message: 'boom', errorCode: 'X' },
    })
  })
})

describe('web 内存缓冲', () => {
  it('超过上限时只保留最近 2000 条', () => {
    for (let i = 0; i < 2_100; i++) writeLocalLog({ lv: 'info', cat: 'test', msg: `m${i}` })
    const entries = readEntries()
    expect(entries).toHaveLength(2_000)
    expect(entries.at(-1).msg).toBe('m2099')
  })
})
