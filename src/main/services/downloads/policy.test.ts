import { DOWNLOAD_LIMITS, seedingDelta, shouldStopSeeding } from '@marchen/shared/downloads'
import { describe, expect, it } from 'vitest'
describe('下载预算与做种策略', () => {
  it('分享率与时间任一达标即停止，零分母不能误触发', () => {
    expect(shouldStopSeeding('ratio-or-time', 100, 100, 0)).toBe(true)
    expect(shouldStopSeeding('ratio-or-time', 0, 100, DOWNLOAD_LIMITS.seedingMs)).toBe(true)
    expect(shouldStopSeeding('ratio-or-time', 99, 100, 1)).toBe(false)
    expect(shouldStopSeeding('ratio-or-time', 0, 0, 0)).toBe(false)
    expect(shouldStopSeeding('forever', 100, 1, DOWNLOAD_LIMITS.seedingMs)).toBe(false)
    expect(shouldStopSeeding('stop', 0, 1, 0)).toBe(true)
  })
  it('暂停、休眠和时钟倒退不累积', () => {
    expect(seedingDelta(1000, 1500, true)).toBe(500)
    expect(seedingDelta(1000, 1500, false)).toBe(0)
    expect(seedingDelta(1000, 100000, true)).toBe(0)
    expect(seedingDelta(1000, 500, true)).toBe(0)
  })
})
