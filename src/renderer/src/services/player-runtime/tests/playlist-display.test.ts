import type { PlaylistEntry } from '../platform'
import { describe, expect, it } from 'vitest'
import { groupPlaylistForDisplay } from '../history/playlist-display'

const entries = (...names: string[]): PlaylistEntry[] =>
  names.map((name) => ({ id: name, name, path: `/anime/${name}` }))

const view = (names: string[]) =>
  groupPlaylistForDisplay(entries(...names)).map((group) => ({
    title: group.title,
    labels: group.items.map((item) => item.label),
  }))

describe('播放列表展示分组', () => {
  it('统一命名的整季折叠公共前缀与后缀，只显示集号', () => {
    expect(
      view([
        '三国演义.The.Romance.of.Three.Kingdoms.1994.E01.1080p.WEB-DL.x264.mp4',
        '三国演义.The.Romance.of.Three.Kingdoms.1994.E02.1080p.WEB-DL.x264.mp4',
        '三国演义.The.Romance.of.Three.Kingdoms.1994.E37.1080p.WEB-DL.x264.mp4',
      ]),
    ).toEqual([
      { title: '三国演义.The.Romance.of.Three.Kingdoms.1994', labels: ['E01', 'E02', 'E37'] },
    ])
  })

  it('字幕组方括号命名补齐括号，SxxExx 与特别篇同组', () => {
    expect(
      view([
        '[ANi] Frieren - 01 [1080P][Baha][WEB-DL].mkv',
        '[ANi] Frieren - 02 [1080P][Baha][WEB-DL].mkv',
      ]),
    ).toEqual([{ title: '[ANi] Frieren', labels: ['01', '02'] }])
    expect(
      view([
        'Youjo Senki 2017 S00E15-[1080p][BDRIP].mkv',
        'Youjo Senki 2017 S01E01-[1080p][BDRIP].mkv',
      ]),
    ).toEqual([{ title: 'Youjo Senki 2017', labels: ['S00E15', 'S01E01'] }])
    expect(view(['[Sub][Show][01][1080p].mkv', '[Sub][Show][02][1080p].mkv'])).toEqual([
      { title: '[Sub][Show]', labels: ['01', '02'] },
    ])
  })

  it('混放目录按相邻条目拆组，不重排且单项不加标题', () => {
    const groups = groupPlaylistForDisplay(
      entries(
        '[Studio GreenTea] Kimi ga Shinu made Koi wo Shitai - 01.mkv',
        '[Studio GreenTea] Kimi ga Shinu made Koi wo Shitai - 02.mkv',
        '三国演义.The.Romance.of.Three.Kingdoms.E01.mkv',
        '三国演义.The.Romance.of.Three.Kingdoms.E02.mkv',
        'random-clip.mp4',
      ),
    )
    expect(groups.map((group) => group.title)).toEqual([
      '[Studio GreenTea] Kimi ga Shinu made Koi wo Shitai',
      '三国演义.The.Romance.of.Three.Kingdoms',
      undefined,
    ])
    expect(groups[2].items[0].label).toBe('random-clip')
    expect(groups.flatMap((group) => group.items.map((item) => item.entry.id))).toEqual([
      '[Studio GreenTea] Kimi ga Shinu made Koi wo Shitai - 01.mkv',
      '[Studio GreenTea] Kimi ga Shinu made Koi wo Shitai - 02.mkv',
      '三国演义.The.Romance.of.Three.Kingdoms.E01.mkv',
      '三国演义.The.Romance.of.Three.Kingdoms.E02.mkv',
      'random-clip.mp4',
    ])
  })

  it('只共享字幕组名或短词时不合并', () => {
    expect(view(['[Nekomoe kissaten] Alpha 01.mkv', '[Nekomoe kissaten] Beta 01.mkv'])).toEqual([
      { title: undefined, labels: ['[Nekomoe kissaten] Alpha 01'] },
      { title: undefined, labels: ['[Nekomoe kissaten] Beta 01'] },
    ])
    expect(view(['2017 Alpha.mkv', '2017 Beta.mkv']).map((group) => group.title)).toEqual([
      undefined,
      undefined,
    ])
  })

  it('差异为空时回退完整文件名，后缀折叠至少保留一个差异词', () => {
    expect(view(['Show Name.mkv', 'Show Name v2.mkv'])).toEqual([
      { title: 'Show Name', labels: ['Show Name', 'v2'] },
    ])
    expect(view(['Show Name 01 END.mkv', 'Show Name 02 END.mkv'])).toEqual([
      { title: 'Show Name', labels: ['01', '02'] },
    ])
  })

  it('空列表与单个文件', () => {
    expect(view([])).toEqual([])
    expect(view(['Movie.2020.1080p.mkv'])).toEqual([
      { title: undefined, labels: ['Movie.2020.1080p'] },
    ])
  })
})
