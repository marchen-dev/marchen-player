import type { DanmakuEntry } from '@marchen/shared/danmaku'
import type { DB_History } from '@renderer/database/schemas/history'
import { describe, expect, it } from 'vitest'

import { accumulateHistoryUsage, emptyHistoryUsage, stripAutoDanmaku } from '../measure'

const content = { count: 1, comments: [] } as unknown as DanmakuEntry['content']

const auto: DanmakuEntry = { type: 'auto', source: 'dandanplay', content }
const local: DanmakuEntry = { type: 'local', source: 'a.xml', content }
const link: DanmakuEntry = {
  type: 'link',
  source: 'bilibili',
  content,
  provider: 'bilibili',
  videoId: 'BV1',
  canonicalUrl: 'https://example.com/BV1',
  title: '外链',
  offsetSeconds: 0,
}

const record = (changes: Partial<DB_History> = {}): DB_History => ({
  hash: 'hash',
  progress: 0,
  duration: 0,
  updatedAt: '2026-10-02T00:00:00.000Z',
  ...changes,
})

describe('stripAutoDanmaku', () => {
  it('混合来源时只移除 auto，保留 local 与 link', () => {
    expect(stripAutoDanmaku([auto, local, link])).toEqual([local, link])
  })

  it('只有 auto 时返回 undefined，表示不再保存弹幕', () => {
    expect(stripAutoDanmaku([auto])).toBeUndefined()
  })

  it('没有 auto 或没有弹幕时返回 null，表示无需改写', () => {
    expect(stripAutoDanmaku([local, link])).toBeNull()
    expect(stripAutoDanmaku(undefined)).toBeNull()
  })
})

describe('accumulateHistoryUsage', () => {
  it('弹幕只统计 auto，集数按含 auto 的记录计', () => {
    const usage = emptyHistoryUsage()
    accumulateHistoryUsage(usage, record({ danmaku: [auto, local] }))
    accumulateHistoryUsage(usage, record({ danmaku: [local, link] }))
    expect(usage.danmaku).toEqual({ bytes: JSON.stringify(auto).length, count: 1 })
  })

  it('缩略图按 base64 长度累计', () => {
    const usage = emptyHistoryUsage()
    accumulateHistoryUsage(usage, record({ thumbnail: 'data:image/jpeg;base64,abcd' }))
    accumulateHistoryUsage(usage, record())
    expect(usage.thumbnail).toEqual({ bytes: 'data:image/jpeg;base64,abcd'.length, count: 1 })
  })
})
