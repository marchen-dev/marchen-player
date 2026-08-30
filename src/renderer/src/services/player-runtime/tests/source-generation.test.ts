import { describe, expect, it, vi } from 'vitest'
import { PlaybackSourceGenerationGuard } from '../source-generation'

const lease = (id: string, release = vi.fn()) => ({
  id,
  logicalSourceId: id,
  mode: 'direct' as const,
  transport: 'custom-protocol' as const,
  url: `marchen:///${id}`,
  timeline: { originalDuration: 0, offset: 0, calibrated: false },
  release,
})

describe('playbackSourceGenerationGuard', () => {
  it('快速换片后立即释放迟到 lease，且不得覆盖当前 generation', () => {
    const guard = new PlaybackSourceGenerationGuard()
    const firstGeneration = guard.begin()
    const secondGeneration = guard.begin()
    const late = lease('late')
    const current = lease('current')

    expect(guard.accept(firstGeneration, late)).toBeNull()
    expect(late.release).toHaveBeenCalledOnce()
    expect(guard.accept(secondGeneration, current)).toBe(current)
    expect(current.release).not.toHaveBeenCalled()
  })

  it('卸载会使仍在准备的 generation 失效', () => {
    const guard = new PlaybackSourceGenerationGuard()
    const generation = guard.begin()
    guard.invalidate(generation)
    const stale = lease('stale')

    expect(guard.accept(generation, stale)).toBeNull()
    expect(stale.release).toHaveBeenCalledOnce()
  })
})
