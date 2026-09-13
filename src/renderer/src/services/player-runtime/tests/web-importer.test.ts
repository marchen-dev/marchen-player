import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebImporter } from '../../player-loading/adapters/web-importer'

describe('webImporter durable source', () => {
  afterEach(() => vi.restoreAllMocks())

  it('hash 成功后只保留 File，不提前创建临时 URL', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:leak')
    const file = {
      name: 'sample.mp4',
      size: 5,
      slice: () => new Blob(['video']),
    } as File

    const video = await new WebImporter().importFromFile(file)
    expect(video.source).toMatchObject({ kind: 'web-file', file })
    expect(video).not.toHaveProperty('url')
    expect(createObjectURL).not.toHaveBeenCalled()
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
