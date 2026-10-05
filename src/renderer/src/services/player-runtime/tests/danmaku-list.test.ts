import type { DanmakuEntry } from '@marchen/shared/danmaku'
import { describe, expect, it } from 'vitest'

import { createDanmakuBlocker } from '../danmaku/danmaku-block'
import { createDefaultDanmakuBlockSettings } from '../danmaku/danmaku-block-settings'
import { buildDanmakuList, filterDanmakuList, findCurrentRowIndex } from '../danmaku/danmaku-list'

const comment = (cid: number, time: number, text: string, mode = 1, color = 16777215) => ({
  cid,
  m: text,
  p: `${time},${mode},${color},0`,
})

const autoEntry: DanmakuEntry = {
  type: 'auto',
  source: 'dandanplay',
  selected: true,
  content: {
    count: 3,
    comments: [comment(1, 30, '後來'), comment(2, 5, 'Hello', 5, 16711680), comment(3, 12, '')],
  },
}

const linkEntry: DanmakuEntry = {
  type: 'link',
  source: 'link:bilibili:BV1',
  provider: 'bilibili',
  videoId: 'BV1',
  canonicalUrl: 'https://www.bilibili.com/video/BV1',
  title: '第 2 集',
  offsetSeconds: -10,
  selected: true,
  content: { count: 2, comments: [comment(1, 4, '被偏移隐藏'), comment(2, 20, '链接弹幕', 4)] },
}

const unselectedEntry: DanmakuEntry = {
  type: 'local',
  source: 'local-file:1/%E5%BC%B9%E5%B9%95.xml',
  selected: false,
  content: { count: 1, comments: [comment(9, 1, '未勾选')] },
}

describe('弹幕列表派生', () => {
  it('只合并已勾选来源，按时间排序并带上来源信息', () => {
    const { rows, sources } = buildDanmakuList([autoEntry, linkEntry, unselectedEntry], {
      simplified: false,
    })

    expect(rows.map((row) => [row.time, row.text, row.sourceName])).toEqual([
      [5, 'Hello', '弹弹play'],
      [10, '链接弹幕', '第 2 集'],
      [30, '後來', '弹弹play'],
    ])
    expect(rows[0]).toMatchObject({ mode: 'top', color: '#ff0000' })
    expect(rows[1]).toMatchObject({ mode: 'bottom', sourceId: 'link:bilibili:BV1' })
    // 条数是实际显示的数量：空文本与偏移到零秒之前的弹幕不计入
    expect(sources).toEqual([
      { id: 'dandanplay', name: '弹弹play', count: 2 },
      { id: 'link:bilibili:BV1', name: '第 2 集', count: 1 },
    ])
  })

  it('不同来源的相同 cid 生成不同的 key', () => {
    const { rows } = buildDanmakuList([autoEntry, linkEntry], { simplified: false })
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
  })

  it('开启繁转简时列表文本与屏幕一致', () => {
    const { rows } = buildDanmakuList([autoEntry], { simplified: true })
    expect(rows.map((row) => row.text)).toEqual(['Hello', '后来'])
  })

  it('没有来源时返回空列表', () => {
    expect(buildDanmakuList(undefined, { simplified: false })).toEqual({
      rows: [],
      sources: [],
      blockedCount: 0,
    })
  })
})

describe('弹幕列表屏蔽联动', () => {
  const blockerWith = (patch: Partial<ReturnType<typeof createDefaultDanmakuBlockSettings>>) =>
    createDanmakuBlocker({ ...createDefaultDanmakuBlockSettings(), ...patch })

  it('标注被屏蔽的行并统计条数，未屏蔽的行不带标注', () => {
    const { rows, blockedCount } = buildDanmakuList([autoEntry, linkEntry], {
      simplified: false,
      blocker: blockerWith({ rules: [{ type: 'keyword', pattern: '后来' }] }),
    })
    // 关键词是简体，繁转简显示关闭时仍命中繁体原文，且行文本保持原样
    const blocked = rows.filter((row) => row.blocked)
    expect(blocked.map((row) => row.text)).toEqual(['後來'])
    expect(blocked[0].blocked).toEqual({
      kind: 'rule',
      rule: { type: 'keyword', pattern: '后来' },
    })
    expect(blockedCount).toBe(1)
    expect(rows).toHaveLength(3)
  })

  it('按类型屏蔽时标注对应类型的行', () => {
    const { rows, blockedCount } = buildDanmakuList([autoEntry, linkEntry], {
      simplified: false,
      blocker: blockerWith({ modes: { scroll: false, top: true, bottom: true } }),
    })
    expect(rows.filter((row) => row.blocked).map((row) => row.mode)).toEqual(['top', 'bottom'])
    expect(blockedCount).toBe(2)
  })

  it('总开关关闭时不标注任何行', () => {
    const { rows, blockedCount } = buildDanmakuList([autoEntry], {
      simplified: false,
      blocker: blockerWith({ enabled: false, rules: [{ type: 'keyword', pattern: 'hello' }] }),
    })
    expect(rows.some((row) => row.blocked)).toBe(false)
    expect(blockedCount).toBe(0)
  })

  it('被屏蔽的行仍参与搜索与来源筛选', () => {
    const { rows } = buildDanmakuList([autoEntry, linkEntry], {
      simplified: false,
      blocker: blockerWith({ rules: [{ type: 'keyword', pattern: 'hello' }] }),
    })
    expect(filterDanmakuList(rows, { keyword: 'hello' }).map((row) => row.text)).toEqual(['Hello'])
  })
})

describe('弹幕列表过滤与定位', () => {
  const { rows } = buildDanmakuList([autoEntry, linkEntry], { simplified: false })

  it('按关键字（忽略大小写和首尾空格）与来源过滤', () => {
    expect(filterDanmakuList(rows, { keyword: ' hello ' }).map((row) => row.text)).toEqual([
      'Hello',
    ])
    expect(filterDanmakuList(rows, { sourceId: 'dandanplay' })).toHaveLength(2)
    expect(filterDanmakuList(rows, { keyword: '弹幕', sourceId: 'dandanplay' })).toEqual([])
  })

  it('没有过滤条件时复用原数组', () => {
    expect(filterDanmakuList(rows, { keyword: '  ' })).toBe(rows)
  })

  it('定位到不晚于当前播放位置的最后一行', () => {
    expect(findCurrentRowIndex(rows, 0)).toBe(-1)
    expect(findCurrentRowIndex(rows, 5)).toBe(0)
    expect(findCurrentRowIndex(rows, 29.9)).toBe(1)
    expect(findCurrentRowIndex(rows, 999)).toBe(2)
    expect(findCurrentRowIndex([], 10)).toBe(-1)
  })
})
