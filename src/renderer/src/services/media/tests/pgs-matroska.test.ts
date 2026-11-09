/**
 * 用 mkvmerge 生成的真实 MKV（fixtures/pgs，自造内容）验证 PGS 轨的目录、索引与按索引读块。
 * 素材由 scripts/generate-pgs-fixtures.mts 生成，显示集内容见其中的 SCRIPT。
 */
import type { DisplaySet } from '../subtitles/pgs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MatroskaSubtitles } from '../subtitles/matroska'
import { composeDisplaySet, isIndependent, parseDisplaySet } from '../subtitles/pgs'

const fixture = (name: string) => {
  const bytes = new Uint8Array(readFileSync(join(__dirname, 'fixtures/pgs', name)))
  const reads: [number, number][] = []
  return {
    reads,
    source: {
      size: bytes.length,
      read: async (start: number, end: number) => {
        reads.push([start, end])
        return bytes.slice(start, end)
      },
    },
  }
}
const open = (name: string) => MatroskaSubtitles.open(fixture(name).source)

describe('目录', () => {
  it('位图轨（PGS）可选，记录视频轨与 PQ 传递函数', async () => {
    const reader = await open('with-cues.mkv')
    expect(reader.tracks).toHaveLength(1)
    expect(reader.tracks[0]).toMatchObject({
      number: 2,
      codec: 'S_HDMV/PGS',
      kind: 'bitmap',
      supported: true,
      title: '自造 PGS',
      header: '',
    })
    expect(reader.video).toEqual({ number: 1, transfer: 'pq' })
  })

  it('没有标注颜色的视频不给出传递函数', async () => {
    const reader = await open('no-subtitle-cues.mkv')
    expect(reader.video).toEqual({ number: 1, transfer: undefined })
    expect(reader.tracks[0].supported).toBe(true)
  })

  it('文件完全没有 Cues 时 PGS 轨标为不支持', async () => {
    const reader = await open('no-cues.mkv')
    expect(reader.tracks[0]).toMatchObject({ supported: false, unsupportedCode: 'missing_index' })
    expect(reader.tracks[0].unsupportedReason).toContain('缺少索引')
  })

  it('位图轨不能按文本读取', async () => {
    const reader = await open('with-cues.mkv')
    await expect(reader.cues(2).next()).rejects.toThrow('图片字幕')
  })
})

describe('索引', () => {
  it('每个字幕块都有索引项，时间与生成脚本一致', async () => {
    const reader = await open('with-cues.mkv')
    const positions = await reader.cueIndex(2)
    expect(positions?.map((position) => position.time)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('关闭字幕 Cues 后该轨没有索引，但视频轨仍有', async () => {
    const reader = await open('no-subtitle-cues.mkv')
    expect(await reader.cueIndex(2)).toBeNull()
    expect((await reader.cueIndex(1))?.length).toBeGreaterThan(0)
  })

  it('按索引读块并解压，解码结果与生成脚本一致', async () => {
    const reader = await open('with-cues.mkv')
    const positions = (await reader.cueIndex(2))!
    const sets: DisplaySet[] = []
    for (const position of positions) {
      const block = await reader.readCueBlock(2, position)
      expect(block.time).toBe(position.time)
      sets.push(parseDisplaySet(block.data))
    }
    expect(sets.map((set) => set.composition.state)).toEqual([
      'epoch_start',
      'normal',
      'acquisition_point',
      'normal',
      'normal',
      'epoch_start',
      'normal',
    ])
    const frameAt = (index: number) => {
      let from = index
      while (!isIndependent(sets[from])) from--
      return composeDisplaySet(sets.slice(from, index + 1), { hdr: true })
    }
    expect(frameAt(0).rects).toMatchObject([{ x: 10, y: 20, width: 40, height: 10 }])
    expect(frameAt(1).rects).toEqual([])
    expect(frameAt(2).rects).toHaveLength(2)
    // 4 s 的 Normal 显示集沿用 3 s 的对象 0，只换位置
    expect(frameAt(3).rects).toMatchObject([{ x: 500, y: 800, width: 30, height: 8 }])
    // 6 s 的分片对象拼接完整
    expect(frameAt(5).rects).toMatchObject([{ width: 64, height: 16 }])
  })

  it('同一 Cluster 的 Cluster 头只读一次', async () => {
    const { source, reads } = fixture('with-cues.mkv')
    const reader = await MatroskaSubtitles.open(source)
    const positions = (await reader.cueIndex(2))!
    const clusters = new Set(positions.map((position) => position.cluster))
    reads.length = 0
    for (const position of positions) await reader.readCueBlock(2, position)
    // 每个块一次读取，外加每个 Cluster 一次 Cluster 头读取
    expect(reads.length).toBe(positions.length + clusters.size)
  })

  it('索引指向错误位置时抛出带稳定原因码的错误', async () => {
    const reader = await open('with-cues.mkv')
    const [first] = (await reader.cueIndex(2))!
    await expect(reader.readCueBlock(2, { ...first, relative: first.relative + 1 })).rejects.toMatchObject({
      reason: 'block_invalid',
    })
  })
})

describe('缺少字幕索引时的有限扫描', () => {
  it('借视频 Cues 扫描，结果与有索引时一致且可按索引读块', async () => {
    const indexed = (await (await open('with-cues.mkv')).cueIndex(2))!
    const reader = await open('no-subtitle-cues.mkv')
    const found = await reader.scanBlocks(2, 2.5, 6.5)
    expect(found.map((position) => position.time)).toEqual([3, 4, 5, 6])
    // 扫描得到的位置与 Cues 的写法一致：relative 指向 BlockGroup / SimpleBlock
    const block = await reader.readCueBlock(2, found[1])
    expect(parseDisplaySet(block.data).composition.state).toBe('normal')
    expect(indexed.map((position) => position.time).slice(2, 6)).toEqual([3, 4, 5, 6])
  })

  it('只读取范围附近的 Cluster', async () => {
    const { source, reads } = fixture('no-subtitle-cues.mkv')
    const reader = await MatroskaSubtitles.open(source)
    expect(await reader.scanBlocks(2, 0, 1.5)).toHaveLength(1)
    const early = reads.length
    reads.length = 0
    expect(await reader.scanBlocks(2, 6.5, 7.5)).toHaveLength(1)
    // 视频 Cues 已缓存，第二次扫描不再读取 Cues
    expect(reads.length).toBeLessThanOrEqual(early)
  })

  it('范围过大或文件没有可用索引时拒绝扫描', async () => {
    const reader = await open('no-subtitle-cues.mkv')
    await expect(reader.scanBlocks(2, 0, 100)).rejects.toThrow('范围')
    const none = await open('no-cues.mkv')
    await expect(none.scanBlocks(2, 0, 5)).rejects.toThrow('索引')
  })
})
