import { describe, expect, it } from 'vitest'
import {
  LocalDanmakuValidationError,
  parseLocalDanmaku,
  readLocalDanmaku,
} from '../../../lib/local-danmaku'

const row = { progress: 1234, mode: 4, color: 0, content: '底部', ctime: 456 }

describe('本地弹幕文件', () => {
  it('保留时间、颜色、默认字段及内容，逐条跳过错误和不支持模式', () => {
    const result = parseLocalDanmaku(
      JSON.stringify([
        row,
        null,
        { ...row, mode: 6 },
        { ...row, mode: 7 },
        { ...row, mode: 8 },
        { ...row, mode: 9 },
        { ...row, progress: -1 },
        { ...row, content: ' ' },
        { ...row, color: -1 },
        { ...row, mode: 0 },
        { mode: 1, color: 4294930235, content: ' 原文 ' },
        { ...row, mode: 2 },
        { ...row, mode: 3 },
        { ...row, mode: 5 },
      ]),
      'json',
    )
    expect(result.skippedCount).toBe(9)
    expect(result.comments).toHaveLength(5)
    expect(result.comments[0]).toEqual({ cid: 456, m: '底部', p: '1.234,4,#000000,456' })
    expect(result.comments[1]).toEqual({ cid: 0, m: ' 原文 ', p: '0,1,#FF6F3B,0' })
  })

  it('整体损坏或顶层错误拒绝，零有效条目单独提示', () => {
    for (const text of ['{', '{}', 'null']) {
      expect(() => parseLocalDanmaku(text, 'json')).toThrow('弹幕格式不正确')
    }
    for (const text of ['[]', '[null]', JSON.stringify([{ ...row, mode: 7 }])]) {
      expect(() => parseLocalDanmaku(text, 'json')).toThrow('文件中没有可导入的弹幕')
    }
    expect(() => parseLocalDanmaku('[]', 'txt')).toThrow(LocalDanmakuValidationError)
  })

  it('超过 10 MB 可导入，同内容改名保持内容标识，统计不写入来源', async () => {
    const text = JSON.stringify([{ ...row, content: '弹'.repeat(4 * 1024 * 1024) }])
    const file = new File([text], '大文件.JSON')
    expect(file.size).toBeGreaterThan(10 * 1024 * 1024)
    const a = await readLocalDanmaku(file)
    const b = await readLocalDanmaku(new File([text], '改名.json'))
    expect(a.entry.content.count).toBe(1)
    expect(a.skippedCount).toBe(0)
    expect(a.entry.source.split('/')[0]).toBe(b.entry.source.split('/')[0])
    expect(a.entry).not.toHaveProperty('skippedCount')
    await expect(readLocalDanmaku(new File([text], '文件.txt'))).rejects.toThrow('弹幕格式不正确')
  })
})
