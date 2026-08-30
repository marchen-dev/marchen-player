import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebSourceLifecyclePort } from '../platform/web'

describe('web SourceLifecyclePort', () => {
  afterEach(() => vi.restoreAllMocks())

  it('只撤销自己创建的 Blob URL，且 release 幂等', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:marchen-video')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const lifecycle = createWebSourceLifecyclePort()

    const handle = await lifecycle.prepare({ kind: 'blob', blob: new Blob(['video']) })
    expect(handle.url).toBe('blob:marchen-video')
    expect(createObjectURL).toHaveBeenCalledOnce()

    handle.release()
    lifecycle.release(handle)
    expect(revokeObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:marchen-video')
  })

  it('dispose 回收仍存活的 URL，但不撤销外部 URL', async () => {
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const lifecycle = createWebSourceLifecyclePort()

    await lifecycle.prepare({ kind: 'blob', blob: new Blob(['first']) })
    await lifecycle.prepare({ kind: 'blob', blob: new Blob(['second']) })
    await lifecycle.prepare({ kind: 'url', url: 'https://example.com/video.mp4' })
    lifecycle.dispose()

    expect(revokeObjectURL.mock.calls).toEqual([['blob:first'], ['blob:second']])
  })
})
