import { describe, expect, it } from 'vitest'
import { isPlayerSessionReady } from '../session-readiness'

describe('nativePlayer session readiness', () => {
  it('换片或退出清空 prepared video 后立即停止渲染 Context consumer', () => {
    expect(isPlayerSessionReady({}, {}, {}, {})).toBe(true)
    expect(isPlayerSessionReady({}, {}, null, {})).toBe(false)
    expect(isPlayerSessionReady(null, {}, {}, {})).toBe(false)
  })
})
