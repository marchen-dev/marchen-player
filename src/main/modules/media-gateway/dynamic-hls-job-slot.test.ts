import { describe, expect, it, vi } from 'vitest'
import { createClosedGopTimeline } from './hls-timeline'
import { DynamicHlsJobSlot } from './dynamic-hls-job-slot'
import { SegmentStore } from './segment-store'

const resource = {
  path: '/cache/segment.m4s',
  mimeType: 'video/iso.segment',
  cacheControl: 'private',
  complete: true,
}

const setup = () => {
  const store = new SegmentStore(
    'session',
    createClosedGopTimeline({ sourceStartTime: 0, duration: 40, targetSegmentDuration: 2 }),
  )
  const order: string[] = []
  const start = vi.fn(async ({ segmentIndex, epoch, workingKey }) => {
    order.push(`start:${epoch}:${segmentIndex}:${workingKey}`)
    return {
      id: `job-${epoch}`,
      coverage: { startSegment: segmentIndex, endSegment: segmentIndex },
      stop: vi.fn(async () => void order.push(`stop:${epoch}`)),
    }
  })
  return {
    store,
    order,
    start,
    slot: new DynamicHlsJobSlot({ store, factory: { start }, maxForwardGapSegments: 2 }),
  }
}

describe('Dynamic HLS session Job slot', () => {
  it('进程已经退出时，相同范围的未完成请求也必须重启生产', async () => {
    const { store } = setup()
    let running = true
    const start = vi.fn(async ({ owner, segmentIndex }) => ({
      id: owner.jobId,
      coverage: { startSegment: segmentIndex },
      isRunning: () => running,
      stop: async () => undefined,
    }))
    const slot = new DynamicHlsJobSlot({ store, factory: { start } })
    await slot.ensure(0)
    running = false
    await slot.ensure(0)
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('关闭发生于异步 start 期间时停止迟到 Job，排队请求不得重启', async () => {
    const { store } = setup()
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const stop = vi.fn(async () => undefined)
    const start = vi.fn(async () => {
      await pending
      return { id: 'job-0', coverage: { startSegment: 0 }, stop }
    })
    const slot = new DynamicHlsJobSlot({ store, factory: { start } })
    const first = slot.ensure(0)
    const rejectedFirst = expect(first).rejects.toThrow('已关闭')
    await Promise.resolve()
    const queued = slot.ensure(10)
    const rejectedQueued = expect(queued).rejects.toThrow('已关闭')
    const closing = slot.close()
    finish()
    await Promise.all([rejectedFirst, rejectedQueued, closing])
    expect(start).toHaveBeenCalledOnce()
    expect(stop).toHaveBeenCalledOnce()
    await expect(slot.ensure(0)).rejects.toThrow('已关闭')
  })

  it('替换结束旧 producing/waiter，回跳重新启动而非永久等待', async () => {
    const { store, slot } = setup()
    await slot.ensure(1)
    const waiting = store.waitFor(1)
    const failure = expect(waiting).rejects.toThrow('替换')
    await slot.ensure(10)
    await failure
    expect(store.snapshot.entries[1]?.status).toBe('failed')
    await slot.ensure(1)
    expect(store.snapshot.entries[1]?.status).toBe('producing')
    store.publish(1, resource, undefined, slot.owner)
    expect(store.snapshot.entries[1]?.status).toBe('published')
  })

  it('近距离请求复用当前 Job，远距离请求串行 stop/start', async () => {
    const { slot, start, order } = setup()
    const first = await slot.ensure(0)
    slot.updateCoverage(first.id, { startSegment: 0, endSegment: 3 })
    await expect(slot.ensure(4)).resolves.toMatchObject({ id: first.id })
    await expect(slot.ensure(10)).resolves.toMatchObject({ id: 'job-1' })
    expect(start).toHaveBeenCalledTimes(2)
    expect(order).toEqual(['start:0:0:job-0', 'stop:0', 'start:1:10:job-1'])
  })

  it('反向/远距离替换前等待活动响应 release', async () => {
    const { slot, store, order } = setup()
    const first = await slot.ensure(5)
    store.publish(5, resource, undefined, slot.owner)
    const acquired = store.acquire(5)!
    const replacement = slot.ensure(1)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(order).toEqual(['start:0:5:job-0'])
    acquired.release()
    await expect(replacement).resolves.toMatchObject({ id: 'job-1' })
    expect(order).toEqual(['start:0:5:job-0', 'stop:0', 'start:1:1:job-1'])
    expect(first.id).not.toBe(slot.current?.id)
  })

  it('并发 far 请求由 session lock 串行，不产生两个写入者', async () => {
    const { slot, start } = setup()
    await slot.ensure(0)
    const [first, second] = await Promise.all([slot.ensure(10), slot.ensure(11)])
    expect(first.id).toBe('job-1')
    expect(second.id).toBe('job-1')
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('release 同样等待活动响应并幂等停止', async () => {
    const { slot, store, order } = setup()
    await slot.ensure(0)
    store.publish(0, resource, undefined, slot.owner)
    const acquired = store.acquire(0)!
    const releasing = slot.release()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(order).toEqual(['start:0:0:job-0'])
    acquired.release()
    await releasing
    await slot.release()
    expect(order).toEqual(['start:0:0:job-0', 'stop:0'])
  })

  it('init 正在响应时也不替换写入者', async () => {
    const { slot, store, order } = setup()
    await slot.ensure(0)
    store.publishInit({ ...resource, mimeType: 'video/mp4' }, slot.owner)
    const acquired = store.acquireInit()!
    const replacement = slot.ensure(10)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(order).toEqual(['start:0:0:job-0'])
    acquired.release()
    await replacement
    expect(order).toEqual(['start:0:0:job-0', 'stop:0', 'start:1:10:job-1'])
  })
})
