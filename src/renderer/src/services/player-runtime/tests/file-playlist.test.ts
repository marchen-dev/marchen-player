import { describe, expect, it } from 'vitest'
import {
  getSelectedPathPlaylist,
  getWebPlaylist,
  rememberWebFile,
  selectFileBatch,
  selectPathBatch,
} from '../../player-loading/file-playlist'

describe('用户授权的播放列表', () => {
  it('过滤非视频并自然排序，切换选中 File 时保留集合', () => {
    const second = new File(['2'], 'episode-2.mkv')
    const tenth = new File(['10'], 'episode-10.mp4')
    expect(selectFileBatch([tenth, new File(['x'], 'note.txt'), second])).toEqual([second, tenth])
    rememberWebFile(second, 'hash-2')
    const first = getWebPlaylist()
    rememberWebFile(tenth, 'hash-10')
    expect(getWebPlaylist().map((entry) => entry.id)).toEqual(first.map((entry) => entry.id))
    expect(getWebPlaylist()[1].fileHash).toBe('hash-10')
  })
  it('electron 只在当前文件属于选择集合时覆盖同目录发现', () => {
    selectPathBatch(['/video/10.mkv', '/video/2.mkv'])
    expect(getSelectedPathPlaylist('/video/2.mkv')?.map((entry) => entry.name)).toEqual([
      '2.mkv',
      '10.mkv',
    ])
    expect(getSelectedPathPlaylist('/other/1.mkv')).toBeNull()
  })
})


it('多容器批量导入保留视频、去重并自然排序，File 和路径规则一致', () => {
  const names = ['10.webm', '2.MOV', '3.m4v', '4.ts', '5.m2ts', '6.mts', '7.qt', '8.mk3d', '9.m2t']
  const selected = names.map((name) => new File(['video'], name))
  const accepted = selectFileBatch([...selected, selected[0], new File(['text'], 'notes.txt')])
  expect(accepted.map((file) => file.name)).toEqual([
    '2.MOV', '3.m4v', '4.ts', '5.m2ts', '6.mts', '7.qt', '8.mk3d', '9.m2t', '10.webm',
  ])
  expect(selectPathBatch([...names, '10.webm', 'notes.txt'].map((name) => `/media/${name}`)))
    .toEqual(accepted.map((file) => `/media/${file.name}`))
})
