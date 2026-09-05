import { describe, expect, it, vi } from 'vitest'
import { createClosedGopTimeline } from './hls-timeline'
import { SegmentBackWindowCleaner } from './segment-back-window-cleaner'
import { SegmentStore } from './segment-store'

const setup = () => {
  const store = new SegmentStore(
    'session',
    createClosedGopTimeline({ sourceStartTime: 0, duration: 300, targetSegmentDuration: 30 }),
  )
  for (const index of [0, 1, 2, 3, 4, 8]) {
    store.publish(index, {
      path: `/cache/segment-${index}.m4s`,
      mimeType: 'video/iso.segment',
      cacheControl: 'private',
      complete: true,
      sizeBytes: 10 + index,
    })
  }
  // 消费到 270s，默认 back window 截止点为 150s。
  store.acquire(8)?.release()
  store.reportPlaybackPosition(270)
  return store
}

describe('SegmentBackWindowCleaner', () => {
  it('反向 seek 再生门禁未通过时完全不删除', async () => {
    const store = setup()
    const removeFile = vi.fn(async (_path: string) => undefined)
    await expect(
      new SegmentBackWindowCleaner({
        store,
        reverseRegenerationValidated: false,
        removeFile,
      }).clean(),
    ).resolves.toEqual({ removedIndices: [], removedBytes: 0 })
    expect(removeFile).not.toHaveBeenCalled()
    expect(store.snapshot.entries[0]?.status).toBe('published')
  })

  it('门禁通过后只删除 back window 之前且无引用的分片', async () => {
    const store = setup()
    const active = store.acquire(1)!
    store.acquire(8)?.release()
    store.reportPlaybackPosition(270)
    const removeFile = vi.fn(async (_path: string) => undefined)
    const result = await new SegmentBackWindowCleaner({
      store,
      reverseRegenerationValidated: true,
      removeFile,
    }).clean()

    expect(result).toEqual({ removedIndices: [0, 2, 3], removedBytes: 35 })
    expect(removeFile.mock.calls.map(([path]) => path)).toEqual([
      '/cache/segment-0.m4s',
      '/cache/segment-2.m4s',
      '/cache/segment-3.m4s',
    ])
    expect(store.snapshot.entries[1]?.status).toBe('published')
    expect(store.snapshot.entries[4]?.status).toBe('published')
    active.release()
  })
  it('删除失败保留待重试文件，即使用户已经回到片头', async () => {
    const store = setup()
    const removeFile = vi
      .fn(async (_path: string) => undefined)
      .mockRejectedValueOnce(new Error('disk busy'))
    const cleaner = new SegmentBackWindowCleaner({
      store,
      reverseRegenerationValidated: true,
      removeFile,
    })
    await expect(cleaner.clean()).rejects.toThrow('disk busy')
    store.reportPlaybackPosition(0)
    const result = await cleaner.clean()
    expect(result.removedIndices).toEqual([0, 1, 2, 3])
    expect(removeFile.mock.calls.filter(([path]) => path === '/cache/segment-0.m4s')).toHaveLength(
      2,
    )
    expect(store.snapshot.entries[4]?.status).toBe('published')
  })
})
