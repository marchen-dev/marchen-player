import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PREPARATION_DEADLINES_MS,
  withPlaybackStageDeadline,
} from '../preparation-deadlines'

afterEach(() => vi.useRealTimers())

describe('Playback preparation deadlines', () => {
  it('为每个准备阶段保留独立硬期限', () => {
    expect(Object.keys(DEFAULT_PREPARATION_DEADLINES_MS)).toEqual([
      'profile',
      'probe',
      'keyframe',
      'preflight',
      'job',
      'segment',
      'mse',
      'first-frame',
    ])
    expect(DEFAULT_PREPARATION_DEADLINES_MS).toMatchObject({ job: 3_000, segment: 8_000 })
  })

  it('超时错误携带具体阻塞阶段', async () => {
    vi.useFakeTimers()
    const waiting = withPlaybackStageDeadline('keyframe', new Promise<void>(() => undefined), {
      deadlineMs: 50,
    })
    const rejected = expect(waiting).rejects.toMatchObject({
      code: 'startup-deadline-exceeded',
      stage: 'metadata',
      deadlineStage: 'keyframe',
    })
    await vi.advanceTimersByTimeAsync(50)
    await rejected
  })
})
