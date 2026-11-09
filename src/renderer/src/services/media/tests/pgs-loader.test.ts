/**
 * 窗口加载器：用 mkvmerge 生成的 fixtures/pgs 素材（显示集 1–7 秒，见 scripts/generate-pgs-fixtures.mts）。
 */
import type { CuePosition } from '../subtitles/matroska'
import type { PgsBlockSource, PgsLoaderFrame } from '../subtitles/pgs/loader'
import type { PgsSessionErrorCode } from '../subtitles/pgs/protocol'
import type { PgsWindowParams } from '../subtitles/pgs/window'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MatroskaSubtitles } from '../subtitles/matroska'
import { PgsWindowLoader } from '../subtitles/pgs/loader'
import { PGS_WINDOW } from '../subtitles/pgs/window'

const openFixture = async (name: string) => {
  const bytes = new Uint8Array(readFileSync(join(__dirname, 'fixtures/pgs', name)))
  return MatroskaSubtitles.open({ size: bytes.length, read: async (start, end) => bytes.slice(start, end) })
}

interface Emitted {
  generation: number
  frames: PgsLoaderFrame[]
  keep: number[]
  ends: [number, number][]
}

function harness(blocks: PgsBlockSource, params: PgsWindowParams = PGS_WINDOW) {
  const emitted: Emitted[] = []
  const errors: { code: PgsSessionErrorCode; fatal: boolean }[] = []
  const loader = new PgsWindowLoader(
    blocks,
    2,
    { hdr: false, now: () => 0 },
    {
      frames: (generation, frames, keep, ends) => emitted.push({ generation, frames, keep, ends }),
      error: (code, _message, fatal) => errors.push({ code, fatal }),
    },
    params,
  )
  /** 按 key 汇总当前代次收到的帧，模拟主线程的保存与释放 */
  const visible = (t: number) => {
    const last = emitted.at(-1)
    if (!last) return undefined
    const frames = new Map<number, PgsLoaderFrame>()
    for (const batch of emitted.filter((item) => item.generation === last.generation)) {
      for (const frame of batch.frames) frames.set(frame.key, frame)
      for (const [key, end] of batch.ends) {
        const frame = frames.get(key)
        if (frame) frames.set(key, { ...frame, end })
      }
      for (const key of [...frames.keys()]) if (!batch.keep.includes(key)) frames.delete(key)
    }
    return [...frames.values()].find((frame) => frame.start <= t && t < frame.end)
  }
  return { loader, emitted, errors, visible }
}

describe('有字幕索引', () => {
  it('定位当前字幕并提前合成 2 秒内的显示集', async () => {
    const reader = await openFixture('with-cues.mkv')
    const { loader, emitted, visible } = harness(reader)
    expect(await loader.start()).toBe('index')
    loader.update(1.5, 0, true)
    await loader.idle()
    expect(emitted.at(-1)!.frames.map((frame) => frame.start)).toEqual([1, 2, 3])
    expect(visible(1.5)?.frame.rects).toMatchObject([{ x: 10, y: 20, width: 40, height: 10 }])
    // 2 秒是清屏包
    expect(visible(2.5)?.frame.rects).toEqual([])
    expect(loader.stats().firstBitmapMs).toBe(0)
  })

  it('跳到 Normal 显示集时回溯到 epoch 起点合成', async () => {
    const reader = await openFixture('with-cues.mkv')
    const { loader, visible } = harness(reader)
    await loader.start()
    loader.update(4.2, 0, false)
    await loader.idle()
    expect(visible(4.2)?.frame.rects).toMatchObject([{ x: 500, y: 800, width: 30, height: 8 }])
    expect(loader.stats().maxBacktrack).toBe(1)
  })

  it('快速连续跳转：只有最后一次跳转的结果会送出', async () => {
    const reader = await openFixture('with-cues.mkv')
    // 每次读块都延后，模拟慢速读取
    const slow: PgsBlockSource = {
      cueIndex: (track, signal) => reader.cueIndex(track, signal),
      scanBlocks: (track, from, to, signal) => reader.scanBlocks(track, from, to, signal),
      readCueBlock: async (track, position, signal) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        signal?.throwIfAborted()
        return reader.readCueBlock(track, position, signal)
      },
    }
    const { loader, emitted, visible } = harness(slow)
    await loader.start()
    loader.update(1.2, 0, true)
    loader.update(6.2, 1, true)
    loader.update(3.1, 2, true)
    await loader.idle()
    expect(emitted.every((batch) => batch.generation === 2)).toBe(true)
    expect(visible(3.1)?.frame.rects).toHaveLength(2)
  })

  it('关闭后不再送出结果', async () => {
    const reader = await openFixture('with-cues.mkv')
    const { loader, emitted } = harness(reader)
    await loader.start()
    loader.update(1.5, 0, true)
    loader.close()
    await loader.idle()
    loader.update(3, 1, true)
    await loader.idle()
    expect(emitted).toEqual([])
  })

  it('个别块失败时跳过，后续字幕照常；连续失败超过阈值时判定会话失败', async () => {
    const reader = await openFixture('with-cues.mkv')
    const failing = (bad: (position: CuePosition) => boolean): PgsBlockSource => ({
      cueIndex: (track, signal) => reader.cueIndex(track, signal),
      scanBlocks: (track, from, to, signal) => reader.scanBlocks(track, from, to, signal),
      readCueBlock: async (track, position, signal) => {
        if (bad(position)) throw new Error('模拟读取失败')
        return reader.readCueBlock(track, position, signal)
      },
    })
    const once = harness(failing((position) => position.time === 2))
    await once.loader.start()
    once.loader.update(1.5, 0, true)
    await once.loader.idle()
    expect(once.visible(1.5)?.frame.rects).toHaveLength(1)
    expect(once.loader.stats().blockFailures).toBe(1)
    expect(once.errors).toEqual([])

    const all = harness(failing(() => true), { ...PGS_WINDOW, maxConsecutiveFailures: 3 })
    await all.loader.start()
    all.loader.update(1.5, 0, true)
    await all.loader.idle()
    expect(all.errors).toEqual([{ code: 'read_failed', fatal: true }])
  })

  it('回溯超限时当前位置不显示，并上报一次非致命错误', async () => {
    const reader = await openFixture('with-cues.mkv')
    const { loader, errors, visible } = harness(reader, { ...PGS_WINDOW, backtrackSets: 1 })
    await loader.start()
    loader.update(4.2, 0, false)
    await loader.idle()
    loader.update(4.3, 0, false)
    await loader.idle()
    expect(visible(4.2)).toBeUndefined()
    expect(errors).toEqual([{ code: 'backtrack_exceeded', fatal: false }])
  })
})

describe('缺少字幕索引（扫描模式）', () => {
  const counting = async () => {
    const reader = await openFixture('no-subtitle-cues.mkv')
    const scans: [number, number][] = []
    const blocks: PgsBlockSource = {
      cueIndex: (track, signal) => reader.cueIndex(track, signal),
      readCueBlock: (track, position, signal) => reader.readCueBlock(track, position, signal),
      scanBlocks: (track, from, to, signal) => {
        scans.push([from, to])
        return reader.scanBlocks(track, from, to, signal)
      },
    }
    return { blocks, scans }
  }

  it('首次只扫描目标前后的有限范围就显示字幕', async () => {
    const { blocks, scans } = await counting()
    const { loader, visible } = harness(blocks)
    expect(await loader.start()).toBe('scan')
    loader.update(4.2, 0, false)
    await loader.idle()
    expect(visible(4.2)?.frame.rects).toMatchObject([{ x: 500, y: 800 }])
    expect(scans).toEqual([[0, 9.2]])
    expect(loader.stats().scanUsed).toBe(true)
  })

  it('暂停时不做后台扫描，播放时向前推进且不重复扫描', async () => {
    const { blocks, scans } = await counting()
    const { loader } = harness(blocks, { ...PGS_WINDOW, scanBehindSeconds: 1, scanAheadSeconds: 1, scanLeadSeconds: 4, scanBackfillSeconds: 2, scanChunkSeconds: 1 })
    await loader.start()
    loader.update(3, 0, false)
    await loader.idle()
    // 分段粒度 1 秒
    expect(scans).toEqual([[2, 3], [3, 4]])
    loader.update(3.1, 0, true)
    await loader.idle()
    // 先补齐首次范围，再向后领先到 t + 4，最后向前补到 t − 2；区间互不重叠
    expect(scans.slice(2)).toEqual([[4, 4.1], [4.1, 5.1], [5.1, 6.1], [6.1, 7.1], [1.1, 2]])
    // 跳回已扫描区域不再扫描
    const before = scans.length
    loader.update(2.5, 1, false)
    await loader.idle()
    expect(scans.length).toBe(before)
  })
})

describe('缓存预算', () => {
  it('超出缓存预算时淘汰离当前窗口最远的块，回到该位置时重新读取', async () => {
    const reader = await openFixture('with-cues.mkv')
    const reads: number[] = []
    const blocks: PgsBlockSource = {
      cueIndex: (track, signal) => reader.cueIndex(track, signal),
      scanBlocks: (track, from, to, signal) => reader.scanBlocks(track, from, to, signal),
      readCueBlock: (track, position, signal) => {
        reads.push(position.time)
        return reader.readCueBlock(track, position, signal)
      },
    }
    // 只读 1 秒、缓存只够放一两个块
    const { loader, visible } = harness(blocks, { ...PGS_WINDOW, aheadSeconds: 0.5, decodeSeconds: 0.5, cachedBytes: 1 })
    await loader.start()
    loader.update(1.2, 0, false)
    await loader.idle()
    loader.update(6.2, 1, false)
    await loader.idle()
    reads.length = 0
    loader.update(1.2, 2, false)
    await loader.idle()
    expect(reads).toContain(1)
    expect(visible(1.2)?.frame.rects).toHaveLength(1)
  })
})
