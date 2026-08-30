import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebSourceLifecyclePort, createWebSubtitleCatalogPort } from '../platform/web'

describe('web subtitle catalog lifecycle', () => {
  afterEach(() => vi.restoreAllMocks())

  it('连续切换时释放旧 URL，重新选择会创建新 URL', async () => {
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:subtitle-1')
      .mockReturnValueOnce('blob:subtitle-2')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const file = { name: 'sample.ass' } as File
    const sourceLifecycle = createWebSourceLifecyclePort()
    const catalog = createWebSubtitleCatalogPort(sourceLifecycle, async () => file)

    const imported = await catalog.importExternal()
    expect(imported?.url).toBe('blob:subtitle-1')
    imported?.release?.()

    const video = new File(['video'], 'video.mp4')
    const source = {
      kind: 'web-file' as const,
      file: video,
      hash: 'hash',
      name: video.name,
      size: video.size,
    }
    const descriptor = (await catalog.list(source))[0]!
    const selectedAgain = await catalog.resolve(source, descriptor)
    expect(selectedAgain.url).toBe('blob:subtitle-2')
    selectedAgain.release?.()

    expect(revokeObjectURL.mock.calls).toEqual([['blob:subtitle-1'], ['blob:subtitle-2']])
  })
})
