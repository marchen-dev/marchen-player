import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { hasDraggedFiles } from './video-drop-utils'

describe('通用视频拖拽区域', () => {
  it('只把系统文件拖拽识别为有效状态', () => {
    expect(hasDraggedFiles(['Files'])).toBe(true)
    expect(hasDraggedFiles(['text/plain', 'Files'])).toBe(true)
    expect(hasDraggedFiles(['text/plain'])).toBe(false)
    expect(hasDraggedFiles([])).toBe(false)
  })

  it('使用深度计数稳定覆盖层，并在禁用、释放和卸载时清理', () => {
    const source = readFileSync(new URL('./VideoDropZone.tsx', import.meta.url), 'utf8')

    expect(source).toContain('dragDepthRef.current += 1')
    expect(source).toContain('Math.max(0, dragDepthRef.current - 1)')
    expect(source).toContain('if (!active)')
    expect(source).toContain('ActiveVideoDropZone')
    expect(source).toContain('const file = event.dataTransfer.files[0]')
    expect(source).toContain('pointer-events-none')
    expect(source).toContain('释放以打开视频')
    expect(source).not.toContain('支持 MP4、MKV')
  })

  it('播放器和影视库复用同一组件并保持各自业务边界', () => {
    const playerSource = readFileSync(
      new URL('../../../page/player/index.tsx', import.meta.url),
      'utf8',
    )
    const librarySource = readFileSync(
      new URL('../../../page/library/index.tsx', import.meta.url),
      'utf8',
    )

    expect(playerSource).toContain('<VideoDropZone')
    expect(playerSource).toContain('active={!preparedVideo}')
    expect(playerSource).toContain('点击或拖拽动漫到此处播放')
    expect(librarySource).toContain('<VideoDropZone')
    expect(librarySource).toContain('active={selectedAnime == null}')
    expect(librarySource).toContain('navigate(RouteName.PLAYER)')
    expect(librarySource).toContain('service.loadFromFile(file)')
  })
})
