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
