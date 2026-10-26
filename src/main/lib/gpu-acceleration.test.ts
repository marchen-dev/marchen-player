import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getGPUFeatureStatus: () => ({}) } }))

const { resolveGpuAcceleration } = await import('./gpu-acceleration')

describe('启动时 GPU 加速归纳', () => {
  it.each([
    [{ gpu_compositing: 'enabled', video_decode: 'enabled' }, 'hardware'],
    [{ gpu_compositing: 'enabled_on', video_decode: 'disabled_software' }, 'partial'],
    [{ gpu_compositing: 'disabled_software', video_decode: 'disabled_software' }, 'software'],
    [{ gpu_compositing: 'unavailable_software', video_decode: 'enabled' }, 'software'],
    [{}, 'software'],
  ])('%o → %s', (status, expected) => {
    expect(resolveGpuAcceleration(status)).toBe(expected)
  })
})
