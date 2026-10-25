import type { BrowseNode } from '@marchen/shared/media-sources'
import { formatDuration, formatSize, pickBrowseView } from '@renderer/page/media-sources/view'
import { describe, expect, it } from 'vitest'

const node = (patch: Partial<BrowseNode> & Pick<BrowseNode, 'type'>): BrowseNode =>
  ({ ref: Math.random().toString(), title: 't', ...patch }) as BrowseNode

describe('媒体源视图规则', () => {
  it('媒体库、剧集、季与电影用网格', () => {
    expect(pickBrowseView([node({ type: 'collection' }), node({ type: 'collection' })])).toBe(
      'grid',
    )
    expect(pickBrowseView([node({ type: 'series' }), node({ type: 'series' })])).toBe('grid')
    expect(pickBrowseView([node({ type: 'video', poster: true })])).toBe('grid')
  })

  it('单集、文件、普通文件夹用列表', () => {
    expect(pickBrowseView([node({ type: 'video' }), node({ type: 'video' })])).toBe('list')
    expect(pickBrowseView([node({ type: 'folder' }), node({ type: 'video' })])).toBe('list')
    expect(pickBrowseView([])).toBe('list')
  })

  it('按多数决定，混合层级不被少数海报带偏', () => {
    expect(
      pickBrowseView([
        node({ type: 'series' }),
        node({ type: 'folder' }),
        node({ type: 'folder' }),
      ]),
    ).toBe('list')
  })

  it('时长与大小格式', () => {
    expect(formatDuration(1450)).toBe('24:10')
    expect(formatDuration(6723)).toBe('1:52:03')
    expect(formatSize(1536 * 1024 * 1024)).toBe('1.5 GB')
    expect(formatSize(512)).toBe('512 B')
  })
})
