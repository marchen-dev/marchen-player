import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MediaCacheManager } from '../ffmpeg/cache'
import { withDynamicHlsCacheAdmission } from './dynamic-hls-cache-admission'
import { DynamicHlsRequestCoordinator } from './dynamic-hls-coordinator'
import { createClosedGopTimeline } from './hls-timeline'
import { SegmentStore } from './segment-store'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

const setup = async (input: {
  sessionBudgetBytes: number
  minimumFreeBytes: number
  freeSpace: number
}) => {
  const root = await mkdtemp(join(tmpdir(), 'marchen-dynamic-budget-'))
  temporaryDirectories.push(root)
  const cache = await new MediaCacheManager({
    root,
    sessionBudgetBytes: input.sessionBudgetBytes,
    minimumFreeBytes: input.minimumFreeBytes,
    freeSpace: async () => input.freeSpace,
  }).createSession()
  const store = new SegmentStore(
    cache.sessionId,
    createClosedGopTimeline({ sourceStartTime: 0, duration: 6, targetSegmentDuration: 2 }),
  )
  return { cache, store }
}

describe('Dynamic HLS cache admission', () => {
  it('超出会话预算时拒绝新生产，不删除已发布旧分片', async () => {
    const { cache, store } = await setup({
      sessionBudgetBytes: 1_024,
      minimumFreeBytes: 0,
      freeSpace: 10_000,
    })
    const oldPath = join(cache.directory, 'segment-0.m4s')
    await writeFile(oldPath, Buffer.alloc(700))
    store.publish(0, {
      path: oldPath,
      mimeType: 'video/iso.segment',
      cacheControl: 'private',
      complete: true,
      sizeBytes: 700,
    })
    const producer = vi.fn()
    const coordinator = new DynamicHlsRequestCoordinator()
    coordinator.register(
      'token',
      store,
      withDynamicHlsCacheAdmission({
        cache,
        producer: { request: producer },
        estimateBytes: () => 400,
      }),
    )

    await expect(coordinator.requestSegment('token', 1)).rejects.toMatchObject({
      detail: { code: 'cache-budget-exceeded' },
    })
    expect(producer).not.toHaveBeenCalled()
    expect(store.snapshot.entries[0]).toMatchObject({ status: 'published', sizeBytes: 700 })
    expect(store.snapshot.entries[1]).toMatchObject({
      status: 'failed',
      error: { code: 'cache-budget-exceeded' },
    })
  })

  it('磁盘将低于安全下限时在生产前失败', async () => {
    const { cache, store } = await setup({
      sessionBudgetBytes: 10_000,
      minimumFreeBytes: 500,
      freeSpace: 600,
    })
    const coordinator = new DynamicHlsRequestCoordinator()
    coordinator.register(
      'token',
      store,
      withDynamicHlsCacheAdmission({
        cache,
        producer: { request: vi.fn() },
        estimateBytes: () => 200,
      }),
    )
    await expect(coordinator.requestSegment('token', 0)).rejects.toMatchObject({
      detail: { code: 'disk-space-low' },
    })
  })
})
