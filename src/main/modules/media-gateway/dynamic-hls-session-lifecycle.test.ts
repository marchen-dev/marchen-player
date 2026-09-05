import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DynamicHlsRequestCoordinator } from './dynamic-hls-coordinator'
import { DynamicHlsJobSlot } from './dynamic-hls-job-slot'
import { createClosedGopTimeline } from './hls-timeline'
import { MediaSourceIntegrityMonitor } from './resilience'
import { SegmentStore } from './segment-store'
import {
  DynamicHlsSessionLifecycle,
  type DynamicHlsLifecycleEvent,
} from './dynamic-hls-session-lifecycle'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

const setup = () => {
  const store = new SegmentStore(
    'session',
    createClosedGopTimeline({ sourceStartTime: 0, duration: 6, targetSegmentDuration: 2 }),
  )
  const coordinator = new DynamicHlsRequestCoordinator()
  coordinator.register('token', store, { request: () => new Promise<void>(() => undefined) })
  const stop = vi.fn(async () => undefined)
  const slot = new DynamicHlsJobSlot({
    store,
    factory: {
      start: async ({ segmentIndex }) => ({
        id: 'job',
        coverage: { startSegment: segmentIndex },
        stop,
      }),
    },
  })
  const lifecycle = new DynamicHlsSessionLifecycle({
    token: 'token',
    store,
    coordinator,
    jobSlot: slot,
  })
  return { store, coordinator, slot, stop, lifecycle }
}

describe('DynamicHlsSessionLifecycle', () => {
  it.each<DynamicHlsLifecycleEvent>([
    'sleep',
    'wake',
    'source-switch',
    'release',
    'renderer-crash',
    'window-close',
    'app-quit',
  ])('%s 会取消 Job/waiter，并拒绝后续路由请求', async (event) => {
    const { coordinator, slot, stop, lifecycle } = setup()
    await slot.ensure(0)
    const waiting = coordinator.requestSegment('token', 1)
    await lifecycle.handle(event)
    await expect(waiting).rejects.toMatchObject({ detail: { code: 'cancelled' } })
    expect(stop).toHaveBeenCalledOnce()
    await expect(coordinator.requestSegment('token', 1)).resolves.toBeUndefined()
    await expect(slot.ensure(0)).rejects.toThrow('已关闭')
    await lifecycle.handle(event)
    expect(stop).toHaveBeenCalledOnce()
  })

  it('源文件 size/mtime 变化时使会话失效', async () => {
    const root = await mkdtemp(join(tmpdir(), 'marchen-source-lifecycle-'))
    temporaryDirectories.push(root)
    const sourcePath = join(root, 'video.mkv')
    await writeFile(sourcePath, 'first')
    const source = new MediaSourceIntegrityMonitor(sourcePath)
    await source.initialize()
    const { store, coordinator, slot, stop } = setup()
    const lifecycle = new DynamicHlsSessionLifecycle({
      token: 'token',
      store,
      coordinator,
      jobSlot: slot,
      source,
    })
    await slot.ensure(0)
    const waiting = coordinator.requestSegment('token', 2)
    await writeFile(sourcePath, 'changed-content')

    await expect(lifecycle.checkSource()).resolves.toBe('released')
    await expect(waiting).rejects.toMatchObject({ detail: { code: 'source-changed' } })
    expect(stop).toHaveBeenCalledOnce()
  })
})
