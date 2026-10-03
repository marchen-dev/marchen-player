import type { DanmakuItem } from '@marchen/danmaku-engine'
import { describe, expect, it } from 'vitest'

import {
  convertDanmakuItemsToSimplified,
  toSimplified,
} from '../danmaku/traditional-to-simplified'

describe('弹幕繁体转简体', () => {
  it('转换常见繁体字形，包括多个繁体合并为同一简体的情况', () => {
    expect(toSimplified('頭髮')).toBe('头发')
    expect(toSimplified('乾淨')).toBe('干净')
    expect(toSimplified('後來')).toBe('后来')
    expect(toSimplified('這集作畫好讚')).toBe('这集作画好赞')
  })

  it('简体、非中文与表情文本保持不变', () => {
    for (const text of ['头发干净', '233333', 'www', '草', 'OP 好听 (≧▽≦)']) {
      expect(toSimplified(text)).toBe(text)
    }
  })

  it('不做地区用语转换', () => {
    expect(toSimplified('軟體')).toBe('软体')
  })

  it('仅替换文本发生变化的条目，其余条目复用原对象', () => {
    const items: DanmakuItem[] = [
      { id: '1', time: 1, text: '這裡', mode: 'scroll', color: '#fff' },
      { id: '2', time: 2, text: '这里', mode: 'scroll', color: '#fff' },
    ]
    const result = convertDanmakuItemsToSimplified(items)
    expect(result[0]).toEqual({ ...items[0], text: '这里' })
    expect(result[1]).toBe(items[1])
  })
})
