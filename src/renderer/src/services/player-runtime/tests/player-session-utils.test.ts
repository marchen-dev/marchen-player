import {
  DEFAULT_CONTROLLER_POSITION,
  resolveControllerPosition,
  withControllerPosition,
} from '@renderer/components/modules/player/controls/controller-position'
import { describe, expect, it } from 'vitest'
import { resolvePlaylistNeighbors } from '../history/playlist'

describe('播放列表相邻项', () => {
  const playlist = [
    { id: '1', name: '第一集', sourceUrl: 'marchen:///anime/01.mkv' },
    { id: '2', name: '第二集', sourceUrl: 'marchen:///anime/02.mkv' },
    { id: '3', name: '第三集', sourceUrl: 'marchen:///anime/03.mkv' },
  ]

  it('兼容带协议和原始路径并保持自然边界', () => {
    expect(resolvePlaylistNeighbors(playlist, '/anime/02.mkv')).toEqual({
      currentIndex: 1,
      previous: playlist[0],
      next: playlist[2],
    })
    expect(resolvePlaylistNeighbors(playlist, '/anime/01.mkv').previous).toBeUndefined()
    expect(resolvePlaylistNeighbors(playlist, '/anime/03.mkv').next).toBeUndefined()
  })
})

describe('控制器位置持久化', () => {
  it('旧设置使用默认位置，桌面更新不删除其他设置', () => {
    expect(resolveControllerPosition(undefined)).toEqual(DEFAULT_CONTROLLER_POSITION)
    expect(
      withControllerPosition(
        { enableDanmaku: true, mobileDockMode: 'compact' },
        { xRatio: 0.2, yRatio: 0.4 },
      ),
    ).toEqual({
      enableDanmaku: true,
      mobileDockMode: 'compact',
      controllerPosition: { xRatio: 0.2, yRatio: 0.4 },
    })
  })
})
