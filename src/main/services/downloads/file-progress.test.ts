import { describe, expect, it } from 'vitest'
import { fileProgress } from './file-progress'

// 4 片，每片 100 字节，最后一片 50 字节，总长 350
const view = (verified: number[], received: Record<number, number> = {}) => ({
  pieceLength: 100,
  length: 350,
  verified: (index: number) => verified.includes(index),
  received: (index: number) => received[index] ?? 0,
})

describe('按文件统计下载进度', () => {
  it('稀有优先下大量分片未收齐时，已下载仍能反映收到的数据', () => {
    const progress = fileProgress({ offset: 0, length: 350 }, view([], { 0: 90, 1: 50, 3: 25 }))
    expect(progress).toEqual({ verifiedBytes: 0, downloadedBytes: 165 })
  })

  it('确认的分片计入两个值，最后一片按实际长度计算', () => {
    const progress = fileProgress({ offset: 0, length: 350 }, view([0, 3], { 1: 40 }))
    expect(progress).toEqual({ verifiedBytes: 150, downloadedBytes: 190 })
  })

  it('边界分片按重叠比例分摊，不把相邻文件的数据算进来', () => {
    // 文件占 [150, 250)：分片 1 的后半和分片 2 的前半
    const progress = fileProgress({ offset: 150, length: 100 }, view([1], { 2: 100 }))
    expect(progress).toEqual({ verifiedBytes: 50, downloadedBytes: 100 })
    const partial = fileProgress({ offset: 150, length: 100 }, view([], { 1: 50, 2: 20 }))
    expect(partial.downloadedBytes).toBe(25 + 10)
  })

  it('异常的已收到值被限制在分片大小内，空文件为 0', () => {
    expect(fileProgress({ offset: 0, length: 100 }, view([], { 0: 999 })).downloadedBytes).toBe(100)
    expect(fileProgress({ offset: 0, length: 100 }, view([], { 0: -5 })).downloadedBytes).toBe(0)
    expect(fileProgress({ offset: 100, length: 0 }, view([1]))).toEqual({ verifiedBytes: 0, downloadedBytes: 0 })
  })
})
