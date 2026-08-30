import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebImporter } from '../../player-loading/adapters/web-importer'

describe('webImporter Object URL', () => {
  afterEach(() => vi.restoreAllMocks())

  it('hash 成功后创建 URL，并提供幂等释放函数', async () => {
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:initial')
      .mockReturnValueOnce('blob:runtime-1')
      .mockReturnValueOnce('blob:runtime-2')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const file = {
      name: 'sample.mp4',
      size: 5,
      slice: () => new Blob(['video']),
    } as File

    const video = await new WebImporter().importFromFile(file)
    expect(video.url).toBe('blob:initial')
    expect(createObjectURL).toHaveBeenCalledWith(file)

    video.releaseSource?.()
    video.releaseSource?.()
    const firstRuntimeLease = video.acquireSource?.()
    const secondRuntimeLease = video.acquireSource?.()
    expect(firstRuntimeLease?.url).toBe('blob:runtime-1')
    expect(secondRuntimeLease?.url).toBe('blob:runtime-2')
    firstRuntimeLease?.release()
    firstRuntimeLease?.release()
    secondRuntimeLease?.release()
    expect(revokeObjectURL.mock.calls).toEqual([
      ['blob:initial'],
      ['blob:runtime-1'],
      ['blob:runtime-2'],
    ])
  })

  it('hash 失败时不会创建 Object URL', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:leak')
    const file = {
      name: 'broken.mp4',
      size: 1,
      slice: () => ({ arrayBuffer: () => Promise.reject(new Error('read failed')) }),
    } as unknown as File

    await expect(new WebImporter().importFromFile(file)).rejects.toThrow('read failed')
    expect(createObjectURL).not.toHaveBeenCalled()
  })
})
