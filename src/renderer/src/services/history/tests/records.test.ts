import type { DB_History } from '@renderer/database/schemas/history'
import type { DB_LibraryEpisode } from '@renderer/database/schemas/library'
import { describe, expect, it } from 'vitest'

import { detachFileFromEpisodes, formatHistoryProgress, toHistoryRecordView } from '../records'

const history = (overrides: Partial<DB_History> = {}): DB_History => ({
  hash: 'hash-1',
  source: { kind: 'electron-file', path: '/video/ep03.mkv', name: 'ep03.mkv', size: 1 },
  animeId: 10,
  episodeId: 1003,
  animeTitle: '某番',
  episodeTitle: '第3话 标题',
  progress: 420,
  duration: 1000,
  updatedAt: '2026-10-05T00:00:00.000Z',
  ...overrides,
})

describe('播放记录视图模型', () => {
  it('已匹配记录显示作品名与集名，并带出进度与本地路径', () => {
    const view = toHistoryRecordView(history({ thumbnail: 'data:thumb', cover: 'https://cover' }))

    expect(view).toEqual({
      hash: 'hash-1',
      title: '某番 第3话 标题',
      image: 'data:thumb',
      ratio: 0.42,
      completed: false,
      matched: true,
      localPath: '/video/ep03.mkv',
    })
  })

  it('未匹配记录显示文件名', () => {
    const view = toHistoryRecordView(
      history({ animeId: 0, episodeId: 0, animeTitle: 'movie.mkv', episodeTitle: '' }),
    )

    expect(view.matched).toBe(false)
    expect(view.title).toBe('movie.mkv')
  })

  it('未匹配且标题为空时回退到来源文件名，再回退到占位文案', () => {
    const base = { animeId: 0, episodeId: 0, animeTitle: '', episodeTitle: '' }

    expect(toHistoryRecordView(history(base)).title).toBe('ep03.mkv')
    expect(toHistoryRecordView(history({ ...base, source: undefined })).title).toBe('未知视频')
  })

  it('没有缩略图时使用封面，两者都没有时不提供图片', () => {
    expect(toHistoryRecordView(history({ cover: 'https://cover' })).image).toBe('https://cover')
    expect(toHistoryRecordView(history()).image).toBeUndefined()
  })

  it('进度达到片长 90% 视为已看完', () => {
    expect(toHistoryRecordView(history({ progress: 899 })).completed).toBe(false)
    expect(toHistoryRecordView(history({ progress: 900 })).completed).toBe(true)
  })

  it('时长缺失或数值异常时进度为 0，不产生 NaN', () => {
    const view = toHistoryRecordView(history({ progress: Number.NaN, duration: 0 }))

    expect(view.ratio).toBe(0)
    expect(view.completed).toBe(false)
  })

  it('进度超过时长时比例封顶为 1', () => {
    expect(toHistoryRecordView(history({ progress: 1200 })).ratio).toBe(1)
  })

  it('远程链接与空路径记录没有可定位的本地路径', () => {
    const remote = history({
      source: { kind: 'remote-url', url: 'https://example.com/a.mkv', name: 'a.mkv' } as never,
    })
    const blank = history({
      source: { kind: 'electron-file', path: '  ', name: 'a.mkv', size: 1 },
    })

    expect(toHistoryRecordView(remote).localPath).toBeUndefined()
    expect(toHistoryRecordView(blank).localPath).toBeUndefined()
  })
})

describe('播放记录进度文案', () => {
  it('按看完、有进度、未开始三种情况给出文案', () => {
    expect(formatHistoryProgress({ ratio: 0.95, completed: true })).toBe('已看完')
    expect(formatHistoryProgress({ ratio: 0.42, completed: false })).toBe('42%')
    expect(formatHistoryProgress({ ratio: 0, completed: false })).toBe('未开始')
  })
})

describe('删除记录时解除影视库关联', () => {
  const episodes: DB_LibraryEpisode[] = [
    { episodeId: 1, episodeNumber: 1, title: 'A', airDate: '', fileHash: 'hash-1' },
    { episodeId: 2, episodeNumber: 2, title: 'B', airDate: '', fileHash: 'hash-2' },
    { episodeId: 3, episodeNumber: 3, title: 'C', airDate: '' },
  ]

  it('只清除引用该文件的剧集，其余剧集保持不变', () => {
    const next = detachFileFromEpisodes(episodes, 'hash-1')

    expect(next?.[0].fileHash).toBeUndefined()
    expect(next?.[0].episodeId).toBe(1)
    expect(next?.[1]).toBe(episodes[1])
    expect(next?.[2]).toBe(episodes[2])
  })

  it('不修改传入的数组', () => {
    detachFileFromEpisodes(episodes, 'hash-1')

    expect(episodes[0].fileHash).toBe('hash-1')
  })

  it('没有剧集引用该文件时返回 null', () => {
    expect(detachFileFromEpisodes(episodes, 'missing')).toBeNull()
    expect(detachFileFromEpisodes([], 'hash-1')).toBeNull()
  })
})
