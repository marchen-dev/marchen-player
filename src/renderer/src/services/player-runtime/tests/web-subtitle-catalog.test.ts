import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebSourceLifecyclePort, createWebSubtitleCatalogPort } from '../platform/web'

describe('web subtitle catalog lifecycle', () => {
  afterEach(() => vi.restoreAllMocks())

  it('保存原始外挂内容后可在新目录实例恢复，不依赖临时 URL', async () => {
    const content = '1\n00:00:01,000 --> 00:00:02,000\n你好\n'
    const lifecycle = createWebSourceLifecyclePort()
    const first = createWebSubtitleCatalogPort(
      lifecycle,
      async () => new File([content], '字幕.srt'),
    )
    const imported = await first.importExternal()
    expect(imported?.persistenceContent).toBe(content)
    imported?.release?.()
    const reopened = createWebSubtitleCatalogPort(lifecycle)
    const restored = await reopened.restoreExternal(
      undefined,
      '字幕.srt',
      'saved',
      imported?.persistenceContent,
    )
    const text = await (await fetch(restored.url)).text()
    expect(text).toContain('Dialogue:')
    expect(text).toContain('你好')
    restored.release?.()
    await expect(reopened.restoreExternal(undefined, '丢失.ass')).rejects.toThrow('重新导入')
    lifecycle.dispose()
  })

  it('连续切换时释放旧 URL，重新选择会创建新 URL', async () => {
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:subtitle-1')
      .mockReturnValueOnce('blob:subtitle-2')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const file = new File(['[Script Info]\nScriptType: v4.00+'], 'sample.ass')
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
