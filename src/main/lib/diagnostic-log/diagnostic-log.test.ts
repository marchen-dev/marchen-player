import type { DiagnosticLogEntry } from './types'
import { describe, expect, it } from 'vitest'

import { fromPlainLog, MAX_LINE_LENGTH, serializeEntry } from './format'
import { createLogThrottle } from './throttle'

const entry = (changes: Partial<DiagnosticLogEntry> = {}): DiagnosticLogEntry => ({
  t: '2026-10-02T00:00:00.000Z',
  lv: 'error',
  src: 'main',
  cat: 'player',
  msg: 'playback_failed',
  ...changes,
})

describe('serializeEntry', () => {
  it('输出单行可解析 JSON，Error 展开为可读字段', () => {
    const line = serializeEntry(entry({ data: { error: new Error('boom') } }))
    expect(line).not.toContain('\n')
    expect(JSON.parse(line).data.error.message).toBe('boom')
  })

  it('超长记录截断 data 并标记 truncated，仍是合法 JSON', () => {
    const line = serializeEntry(entry({ data: 'x'.repeat(MAX_LINE_LENGTH * 2) }))
    expect(line.length).toBeLessThanOrEqual(MAX_LINE_LENGTH)
    expect(JSON.parse(line).truncated).toBe(true)
  })

  it('循环引用不抛错', () => {
    const data: Record<string, unknown> = {}
    data.self = data
    expect(() => JSON.parse(serializeEntry(entry({ data })))).not.toThrow()
  })
})

describe('fromPlainLog', () => {
  it('第三方纯文本包装为 updater 记录', () => {
    const result = fromPlainLog('verbose', ['Checking for update', 1], new Date(0))
    expect(result).toMatchObject({ lv: 'debug', cat: 'updater', msg: 'Checking for update 1' })
  })
})

describe('createLogThrottle', () => {
  const setup = (options = {}) => {
    let time = 0
    const written: DiagnosticLogEntry[] = []
    const throttle = createLogThrottle((item) => written.push(item), {
      now: () => time,
      ...options,
    })
    return { throttle, written, advance: (ms: number) => (time += ms) }
  }

  it('窗口内同类记录超过上限后合并为一条计数记录', () => {
    const { throttle, written, advance } = setup({ burst: 5, windowMs: 10_000 })
    for (let i = 0; i < 100; i++) throttle.push(entry())
    expect(written).toHaveLength(5)
    advance(10_000)
    throttle.tick()
    expect(written).toHaveLength(6)
    expect(written[5].repeated).toBe(95)
  })

  it('不同错误码分开计数', () => {
    const { throttle, written } = setup({ burst: 1 })
    throttle.push(entry({ data: { error_code: 'A' } }))
    throttle.push(entry({ data: { error_code: 'B' } }))
    expect(written).toHaveLength(2)
  })

  it('info 超过每分钟上限后丢弃并在下一分钟补写统计；error 不受限', () => {
    const { throttle, written, advance } = setup({ infoPerMinute: 3, burst: 100 })
    for (let i = 0; i < 5; i++) throttle.push(entry({ lv: 'info', msg: `info_${i}` }))
    throttle.push(entry({ msg: 'still_written' }))
    expect(written.map((item) => item.msg)).toEqual(['info_0', 'info_1', 'info_2', 'still_written'])
    advance(60_000)
    throttle.tick()
    expect(written.at(-1)).toMatchObject({ msg: 'info_rate_limited', data: { dropped: 2 } })
  })

  it('flush 立即写出未结束窗口的汇总', () => {
    const { throttle, written } = setup({ burst: 1 })
    throttle.push(entry())
    throttle.push(entry())
    throttle.flush()
    expect(written.at(-1)?.repeated).toBe(1)
  })
})
