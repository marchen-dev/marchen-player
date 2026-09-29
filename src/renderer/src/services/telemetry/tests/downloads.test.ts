import type { DownloadSnapshot, DownloadTask } from '@marchen/shared/downloads'
import { describe, expect, it, vi } from 'vitest'
import { DownloadTelemetryObserver } from '../downloads'

const task = (): DownloadTask => ({
  id: 'private-id',
  infoHash: 'private-hash',
  name: '私有文件.mkv',
  directory: '/private/downloads',
  files: [
    {
      index: 0,
      path: '私有文件.mkv',
      size: 100,
      selected: true,
      verifiedBytes: 0,
      complete: false,
    },
  ],
  intent: 'running',
  state: 'downloading',
  createdAt: 0,
  updatedAt: 0,
  selectedBytes: 100,
  downloadSpeed: 2,
  peers: 2,
})
function harness() {
  let now = 0
  let revision = 0
  const capture = vi.fn()
  const observer = new DownloadTelemetryObserver(capture, () => now)
  return {
    capture,
    observer,
    time: (value: number) => {
      now = value
    },
    observe: (tasks: DownloadTask[]) => {
      const snapshot: DownloadSnapshot = {
        revision: ++revision,
        tasks: structuredClone(tasks),
        settings: { directory: '/private', uploadLimit: -1 },
      }
      observer.observe(snapshot)
      return snapshot
    },
  }
}
describe('下载埋点', () => {
  it('初始快照不重报历史，重复或旧 revision 不重复计数', () => {
    const h = harness()
    const t = task()
    h.observe([t])
    expect(h.capture).not.toHaveBeenCalled()
    t.state = 'completed'
    t.completedAt = 100
    const snapshot = h.observe([t])
    h.observer.observe(snapshot)
    h.observer.observe({ ...snapshot, revision: 0 })
    expect(h.capture).toHaveBeenCalledTimes(1)
    expect(h.capture.mock.calls[0][1].state).toBe('completed')
  })
  it('记录新建和失败，属性不含私有字段或错误原文', () => {
    const h = harness()
    const t = task()
    h.observe([])
    h.observe([t])
    t.state = 'error'
    t.error = 'secret https://example.com/?token=private'
    h.observe([t])
    h.observe([t])
    expect(h.capture).toHaveBeenCalledTimes(2)
    expect(h.capture.mock.calls[1][1]).toMatchObject({
      state: 'failed',
      error_code: 'download_failed',
    })
    expect(JSON.stringify(h.capture.mock.calls)).not.toMatch(/private|私有|secret|token|example/)
  })
  it('60 秒无校验进度只报一次，进度恢复后可报告新的停滞', () => {
    const h = harness()
    const t = task()
    h.observe([t])
    h.time(60000)
    h.observe([t])
    h.time(120000)
    h.observe([t])
    expect(h.capture).toHaveBeenCalledTimes(1)
    t.files[0].verifiedBytes = 1
    h.observe([t])
    h.time(180000)
    h.observe([t])
    expect(h.capture).toHaveBeenCalledTimes(2)
    t.state = 'paused'
    t.intent = 'paused'
    h.observe([t])
    h.time(300000)
    h.observe([t])
    expect(h.capture).toHaveBeenCalledTimes(2)
  })
  it('恢复时离线校验已完成任务不产生新的完成事件', () => {
    const h = harness()
    const t = task()
    t.state = 'checking'
    t.completedAt = 10
    h.observe([t])
    t.state = 'completed'
    h.observe([t])
    expect(h.capture).not.toHaveBeenCalled()
  })
})

it('没有新快照时仍能检测停滞，HTTP 排队不算下载停滞', () => {
  const h = harness()
  const queued = {
    ...task(),
    id: 'queued',
    state: 'waiting' as const,
    http: {
      url: 'https://example.com/private',
      urlChain: [],
      partialName: 'private.part',
      offset: 0,
      etag: '',
      lastModified: '',
    },
  }
  h.observe([task(), queued])
  h.time(60000)
  h.observer.tick()
  h.observer.tick()
  expect(h.capture).toHaveBeenCalledTimes(1)
  expect(h.capture.mock.calls[0][1].kind).toBe('bt')
})
