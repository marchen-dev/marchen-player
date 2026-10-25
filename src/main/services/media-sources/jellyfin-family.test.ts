import type { JellyfinFamily } from './jellyfin-family'
import { describe, expect, it, vi } from 'vitest'
import {
  createJellyfinFamilyFactory,
  createJellyfinFamilyProvider,
  isSupportedVersion,
  subtitleFormat,
} from './jellyfin-family'

/**
 * 夹具按 Jellyfin 10.9 / Emby 4.8 的接口返回结构手写，只保留本实现读取的字段。
 * 真实服务端验收见 tasks 10.2。
 */
const SOURCE_ID = '7b0c8e7e-5c6a-4f55-9d0b-2f8a1f6e0001'
const USER = 'u1'

const views = {
  Items: [
    {
      Id: 'lib-tv',
      Name: '番剧',
      CollectionType: 'tvshows',
      Type: 'CollectionFolder',
      ImageTags: { Primary: 't1' },
    },
    { Id: 'lib-movie', Name: '电影', CollectionType: 'movies', Type: 'CollectionFolder' },
  ],
}

const items: Record<string, unknown> = {
  'lib-tv': { Id: 'lib-tv', Name: '番剧', Type: 'CollectionFolder', CollectionType: 'tvshows' },
  'lib-movie': {
    Id: 'lib-movie',
    Name: '电影',
    Type: 'CollectionFolder',
    CollectionType: 'movies',
  },
  'series-1': { Id: 'series-1', Name: '葬送的芙莉莲', Type: 'Series' },
  'series-2': { Id: 'series-2', Name: '两季的番', Type: 'Series' },
  'ep-2': {
    Id: 'ep-2',
    Name: '第 2 集',
    Type: 'Episode',
    IndexNumber: 2,
    SeasonId: 'season-1',
    ParentId: 'season-1',
    MediaSources: [
      {
        Id: 'ms-2',
        Path: '/media/anime/Frieren/[Sub] Frieren - 02.mkv',
        Size: 123,
        Container: 'mkv',
        MediaStreams: [
          { Type: 'Video', Index: 0 },
          {
            Type: 'Subtitle',
            Index: 2,
            Codec: 'ass',
            Language: 'chi',
            DisplayTitle: '简体中文',
            IsTextSubtitleStream: true,
          },
          { Type: 'Subtitle', Index: 3, Codec: 'PGSSUB', IsTextSubtitleStream: false },
          {
            Type: 'Subtitle',
            Index: 4,
            Codec: 'subrip',
            Title: 'English',
            IsTextSubtitleStream: true,
          },
        ],
      },
    ],
  },
  'movie-1': {
    Id: 'movie-1',
    Name: '铃芽之旅',
    Type: 'Movie',
    ParentId: 'lib-movie',
    MediaSources: [{ Id: 'ms-m', Path: 'D:\\Movies\\Suzume (2022).mp4', Size: 9 }],
  },
}

const children: Record<string, unknown[]> = {
  'lib-tv:Series': [
    {
      Id: 'series-1',
      Name: '葬送的芙莉莲',
      Type: 'Series',
      ProductionYear: 2023,
      ImageTags: { Primary: 'p1' },
    },
  ],
  'lib-movie:Movie': [
    {
      Id: 'movie-1',
      Name: '铃芽之旅',
      Type: 'Movie',
      ImageTags: { Primary: 'pm' },
      RunTimeTicks: 72_000_000_000,
    },
  ],
  'series-1:Season': [{ Id: 'season-1', Name: '第 1 季', Type: 'Season', IndexNumber: 1 }],
  'series-2:Season': [
    { Id: 'season-b', Name: '第 2 季', Type: 'Season', IndexNumber: 2 },
    { Id: 'season-a', Name: '第 1 季', Type: 'Season', IndexNumber: 1 },
  ],
  'season-1:Episode': [
    { Id: 'ep-10', Name: '第 10 集', Type: 'Episode', IndexNumber: 10, ParentIndexNumber: 1 },
    {
      Id: 'ep-2',
      Name: '第 2 集',
      Type: 'Episode',
      IndexNumber: 2,
      ParentIndexNumber: 1,
      RunTimeTicks: 14_400_000_000,
      ImageTags: { Primary: 'e2' },
    },
  ],
}

function server(family: JellyfinFamily) {
  const tokenHeader = family === 'jellyfin' ? 'Authorization' : 'X-Emby-Token'
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    const json = (value: unknown) => Response.json(value)
    if (url.pathname === '/System/Info/Public')
      return json({ Version: family === 'jellyfin' ? '10.9.11' : '4.8.10.0', Id: 'server' })
    if (url.pathname === '/Users/AuthenticateByName') {
      const body = JSON.parse(String(init?.body))
      if (body.Pw !== 'secret') return new Response(null, { status: 401 })
      return json({ AccessToken: 'tok', User: { Id: USER }, ServerId: 'server' })
    }
    const auth = headers.get(tokenHeader) ?? ''
    if (!auth.includes('tok')) return new Response(null, { status: 401 })
    if (url.pathname === `/Users/${USER}/Views`) return json(views)
    if (url.pathname === `/Users/${USER}/Items`) {
      const key = `${url.searchParams.get('ParentId')}:${url.searchParams.get('IncludeItemTypes')}`
      return json({ Items: children[key] ?? [] })
    }
    const item = url.pathname.match(/^\/Users\/u1\/Items\/(.+)$/)?.[1]
    if (item) return items[item] ? json(items[item]) : new Response(null, { status: 404 })
    if (url.pathname === '/Videos/ep-2/ms-2/Subtitles/2/Stream.ass')
      return new Response('[Script Info]')
    return new Response(null, { status: 404 })
  })
}

const provider = (family: JellyfinFamily) =>
  createJellyfinFamilyProvider({
    family,
    sourceId: SOURCE_ID,
    url: 'http://192.168.1.2:8096',
    deviceId: 'device',
    version: '1.0.7',
    token: 'tok',
    userId: USER,
  })

describe.each(['jellyfin', 'emby'] as const)('%s provider', (family) => {
  it('连接：检查版本、登录后只保存令牌', async () => {
    vi.stubGlobal('fetch', server(family))
    try {
      const factory = createJellyfinFamilyFactory(family, () => '1.0.7')
      const result = await factory.connect(
        { url: 'http://192.168.1.2:8096/', username: 'me', password: 'secret' },
        'device',
      )
      expect(result).toEqual({
        url: 'http://192.168.1.2:8096',
        credential: { type: 'token', token: 'tok', userId: USER, serverId: 'server' },
      })
      expect(JSON.stringify(result)).not.toContain('secret')
      await expect(
        factory.connect({ url: 'http://192.168.1.2:8096', username: 'me', password: 'bad' }, 'd'),
      ).rejects.toMatchObject({ code: 'auth_failed' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('浏览：根层级是媒体库，剧集库列海报，只有一季直接给单集', async () => {
    vi.stubGlobal('fetch', server(family))
    try {
      const p = provider(family)
      const root = await p.browse(null)
      expect(root.nodes.map((node) => [node.type, node.ref])).toEqual([
        ['collection', 'lib-tv'],
        ['collection', 'lib-movie'],
      ])
      expect(root.nodes[0].image).toBe(
        `marchen://source-image/${SOURCE_ID}/lib-tv/Primary?w=480&tag=t1`,
      )
      const tv = await p.browse('lib-tv')
      expect(tv.nodes[0]).toMatchObject({ type: 'series', ref: 'series-1', year: 2023 })
      const series = await p.browse('series-1')
      expect(series.nodes.map((node) => node.ref)).toEqual(['ep-2', 'ep-10'])
      expect(series.nodes[0]).toMatchObject({ type: 'video', index: 2, duration: 1440, wide: true })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('浏览：多季按季号排序，电影库给出可直接播放的海报', async () => {
    vi.stubGlobal('fetch', server(family))
    try {
      const p = provider(family)
      expect((await p.browse('series-2')).nodes.map((node) => node.ref)).toEqual([
        'season-a',
        'season-b',
      ])
      expect((await p.browse('lib-movie')).nodes[0]).toMatchObject({
        type: 'video',
        poster: true,
        duration: 7200,
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('播放：静态原文件地址，文件名取服务端路径', async () => {
    vi.stubGlobal('fetch', server(family))
    try {
      const p = provider(family)
      expect(await p.resolvePlayback('ep-2')).toEqual({
        url: 'http://192.168.1.2:8096/Videos/ep-2/stream?static=true&MediaSourceId=ms-2',
        name: '[Sub] Frieren - 02.mkv',
      })
      expect((await p.resolvePlayback('movie-1')).name).toBe('Suzume (2022).mp4')
      await expect(p.resolvePlayback('series-1')).rejects.toMatchObject({ code: 'not_found' })
      await expect(p.resolvePlayback('missing')).rejects.toMatchObject({ code: 'not_found' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('连播：单集按同季顺序，电影不连到下一部', async () => {
    vi.stubGlobal('fetch', server(family))
    try {
      const p = provider(family)
      expect((await p.siblings('ep-2')).map((node) => node.ref)).toEqual(['ep-2', 'ep-10'])
      expect((await p.siblings('movie-1')).map((node) => node.ref)).toEqual(['movie-1'])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('字幕：只列文本字幕，正文由服务端抽取', async () => {
    vi.stubGlobal('fetch', server(family))
    try {
      const p = provider(family)
      expect(await p.subtitles('ep-2')).toEqual([
        { id: '2', title: '简体中文', format: 'ass', language: 'chi' },
        { id: '4', title: 'English', format: 'srt', language: undefined },
      ])
      expect(await p.readSubtitle('ep-2', '2')).toBe('[Script Info]')
      await expect(p.readSubtitle('ep-2', '3')).rejects.toMatchObject({ code: 'not_found' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('令牌失效映射为 auth_failed', async () => {
    vi.stubGlobal('fetch', server(family))
    try {
      const p = createJellyfinFamilyProvider({
        family,
        sourceId: SOURCE_ID,
        url: 'http://192.168.1.2:8096',
        deviceId: 'device',
        version: '1.0.7',
        token: 'revoked',
        userId: USER,
      })
      await expect(p.browse(null)).rejects.toMatchObject({ code: 'auth_failed' })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('jellyfin / Emby 方言', () => {
  it('鉴权头写法不同', () => {
    expect(provider('jellyfin').authHeaders().Authorization).toMatch(/^MediaBrowser .*Token="tok"/)
    const emby = provider('emby').authHeaders()
    expect(emby['X-Emby-Token']).toBe('tok')
    expect(emby['X-Emby-Authorization']).toMatch(/^Emby UserId="u1"/)
  })

  it('最低版本', () => {
    expect(isSupportedVersion('jellyfin', '10.8.0')).toBe(true)
    expect(isSupportedVersion('jellyfin', '10.7.7')).toBe(false)
    expect(isSupportedVersion('emby', '4.7.14.0')).toBe(true)
    expect(isSupportedVersion('emby', '4.6.7.0')).toBe(false)
    expect(isSupportedVersion('emby', undefined)).toBe(false)
  })

  it('字幕编码映射', () => {
    expect(subtitleFormat('SSA')).toBe('ass')
    expect(subtitleFormat('webvtt')).toBe('vtt')
    expect(subtitleFormat('mov_text')).toBe('srt')
    expect(subtitleFormat('dvd_subtitle')).toBeUndefined()
  })
})
