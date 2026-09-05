import { describe, expect, it } from 'vitest'
import { createClosedGopTimeline } from './hls-timeline'
import { SegmentStore } from './segment-store'

const timeline = createClosedGopTimeline({
  sourceStartTime: 0,
  duration: 6,
  targetSegmentDuration: 2,
})
const resource = (path: string, sizeBytes = 10) => ({
  path,
  mimeType: 'video/iso.segment',
  cacheControl: 'private, max-age=31536000',
  complete: true,
  sizeBytes,
})

describe('SegmentStore', () => {
  it('Job 换代后拒绝迟到发布，失败的等待可由新 Job 重试', async () => {
    const store = new SegmentStore('session', timeline)
    const first = { jobId: 'first', epoch: 0 },
      next = { jobId: 'next', epoch: 1 }
    store.beginJob(first, 1)
    const waiting = store.waitFor(1)
    store.endJob(first, {
      code: 'cancelled',
      stage: 'transcode',
      message: 'Job 已替换',
      recoverable: true,
    })
    await expect(waiting).rejects.toThrow('已替换')
    store.beginJob(next, 1)
    expect(() => store.publish(1, resource('/old'), undefined, first)).toThrow('过期')
    expect(() => store.publish(1, resource('/unowned'))).toThrow('过期')
    store.publish(1, resource('/new'), undefined, next)
    expect(store.acquire(1)?.resource.path).toBe('/new')
  })

  it('等待 producing segment，发布后解析 waiter 并更新生产位置/字节', async () => {
    const store = new SegmentStore('session', timeline)
    store.markProducing(1)
    const waiting = store.waitFor(1, { timeoutMs: 1_000 })
    expect(store.snapshot.entries[1]).toMatchObject({ status: 'producing', waiterCount: 1 })
    store.publish(1, resource('/cache/segment-1.m4s', 12))
    await expect(waiting).resolves.toMatchObject({ path: '/cache/segment-1.m4s' })
    expect(store.snapshot).toMatchObject({ productionPosition: 4, publishedBytes: 12 })
    expect(JSON.stringify(store.snapshot)).not.toContain('/cache')
  })

  it('活动请求阻止 evict，幂等 release 后允许清理', () => {
    const store = new SegmentStore('session', timeline)
    store.publish(0, resource('/cache/segment-0.m4s'))
    const acquired = store.acquire(0)!
    expect(store.snapshot.entries[0]?.activeRequestCount).toBe(1)
    expect(store.snapshot.downloadPosition).toBe(2)
    expect(store.evict(0)).toBe(false)
    acquired.release()
    acquired.release()
    expect(store.evict(0)).toBe(true)
    expect(store.snapshot.entries[0]?.status).toBe('evicted')
  })

  it('消费位置跟随最近请求，反向 seek 可以回退', () => {
    const store = new SegmentStore('session', timeline)
    store.publish(2, resource('/cache/segment-2.m4s'))
    store.publish(0, resource('/cache/segment-0.m4s'))
    store.acquire(2)?.release()
    expect(store.snapshot.downloadPosition).toBe(6)
    store.acquire(0)?.release()
    expect(store.snapshot.downloadPosition).toBe(2)
  })

  it('取消 waiter 只移除当前等待者，不改变 segment 状态', async () => {
    const store = new SegmentStore('session', timeline)
    const controller = new AbortController()
    const waiting = store.waitFor(2, { signal: controller.signal })
    controller.abort(new Error('client closed'))
    await expect(waiting).rejects.toThrow('client closed')
    expect(store.snapshot.entries[2]).toMatchObject({ status: 'missing', waiterCount: 0 })
  })

  it('失败唤醒全部 waiter，并保留结构化错误', async () => {
    const store = new SegmentStore('session', timeline)
    const first = store.waitFor(0)
    const second = store.waitFor(0)
    store.fail(0, {
      code: 'generation-failed',
      stage: 'transcode',
      message: 'producer failed',
      recoverable: true,
    })
    await expect(first).rejects.toMatchObject({ detail: { code: 'generation-failed' } })
    await expect(second).rejects.toMatchObject({ detail: { code: 'generation-failed' } })
    expect(store.snapshot.entries[0]).toMatchObject({ status: 'failed', waiterCount: 0 })
  })

  it('init 与 segment 分开发布且均不可覆盖', async () => {
    const store = new SegmentStore('session', timeline)
    const waiting = store.waitForInit()
    expect(store.snapshot.initWaiterCount).toBe(1)
    store.publishInit({ ...resource('/cache/init.mp4', 5), mimeType: 'video/mp4' })
    await expect(waiting).resolves.toMatchObject({ mimeType: 'video/mp4' })
    const acquired = store.acquireInit()!
    expect(store.snapshot).toMatchObject({
      initStatus: 'published',
      initWaiterCount: 0,
      initActiveRequestCount: 1,
      publishedBytes: 5,
    })
    acquired.release()
    acquired.release()
    expect(store.snapshot.initActiveRequestCount).toBe(0)
    expect(() => store.publishInit(resource('/cache/next-init.mp4'))).toThrow('不可覆盖')
  })
  it('乱序预取不改变播放位置，远端稀疏分片不扩展连续窗口', () => {
    const store = new SegmentStore(
      'session',
      createClosedGopTimeline({ sourceStartTime: 0, duration: 20, targetSegmentDuration: 2 }),
    )
    store.reportPlaybackPosition(1)
    for (const index of [0, 1, 8]) store.publish(index, resource(`/cache/${index}`))
    store.acquire(8)?.release()
    store.acquire(0)?.release()
    expect(store.snapshot).toMatchObject({
      consumptionPosition: 1,
      downloadPosition: 2,
      continuousPublishedEnd: 4,
    })
    store.reportPlaybackPosition(16)
    expect(store.snapshot.continuousPublishedEnd).toBe(18)
    store.reportPlaybackPosition(6)
    expect(store.snapshot.continuousPublishedEnd).toBe(6)
  })
})
