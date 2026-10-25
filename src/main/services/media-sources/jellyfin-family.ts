import type {
  BrowseNode,
  BrowseVideoNode,
  ProviderSubtitle,
  ProviderSubtitleFormat,
  SourceImageKind,
} from '@marchen/shared/media-sources'
import type { MediaSourceProvider, ProviderFactory } from './provider'
import { createAuthorizedFetcher } from '@main/lib/remote-media'
import { MediaSourceError } from '@marchen/shared/media-sources'
import { sourceImageUrl } from './image-proxy'
import {
  naturalCompare,
  normalizeServerUrl,
  providerRequest,
  readLimitedText,
  SUBTITLE_SIZE_LIMIT,
} from './provider'

/**
 * Jellyfin 是从 Emby 分出来的，API 基本一致；差异只放在 dialect 里：
 * 鉴权头的写法和最低支持版本。
 */
export type JellyfinFamily = 'jellyfin' | 'emby'

const CLIENT = 'Marchen Player'
/** 服务端首次从大容器里抽取内嵌字幕可能要读完整个文件，比普通 API 请求慢得多 */
const SUBTITLE_EXTRACT_TIMEOUT = 120_000
const MIN_VERSION: Record<JellyfinFamily, [number, number]> = {
  jellyfin: [10, 8],
  emby: [4, 7],
}

interface Session {
  token?: string
  userId?: string
}

function authHeaders(
  family: JellyfinFamily,
  deviceId: string,
  version: string,
  session: Session,
): Record<string, string> {
  const fields = [
    `Client="${CLIENT}"`,
    `Device="${CLIENT}"`,
    `DeviceId="${deviceId}"`,
    `Version="${version}"`,
  ]
  if (family === 'jellyfin') {
    if (session.token) fields.push(`Token="${session.token}"`)
    return { Authorization: `MediaBrowser ${fields.join(', ')}` }
  }
  const headers: Record<string, string> = {
    'X-Emby-Authorization': `Emby ${session.userId ? `UserId="${session.userId}", ` : ''}${fields.join(', ')}`,
  }
  if (session.token) headers['X-Emby-Token'] = session.token
  return headers
}

/** 「10.9.11」「4.8.10.0」→ 是否不低于最低版本 */
export function isSupportedVersion(family: JellyfinFamily, version: unknown) {
  if (typeof version !== 'string') return false
  const [major, minor] = version.split('.').map(Number)
  const [minMajor, minMinor] = MIN_VERSION[family]
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false
  return major > minMajor || (major === minMajor && minor >= minMinor)
}

interface Item {
  Id: string
  Name?: string
  Type?: string
  CollectionType?: string
  IndexNumber?: number
  ParentIndexNumber?: number
  ProductionYear?: number
  RunTimeTicks?: number
  ImageTags?: Record<string, string>
  ParentId?: string
  SeasonId?: string
  SeriesId?: string
  Path?: string
  MediaSources?: MediaSourceInfo[]
}

interface MediaSourceInfo {
  Id: string
  Path?: string
  Name?: string
  Size?: number
  Container?: string
  MediaStreams?: Array<{
    Type?: string
    Index?: number
    Codec?: string
    Language?: string
    DisplayTitle?: string
    Title?: string
    IsTextSubtitleStream?: boolean
    IsExternal?: boolean
  }>
}

const VIDEO_TYPES = new Set(['Movie', 'Episode', 'Video', 'MusicVideo'])
const FOLDER_TYPES = new Set([
  'Folder',
  'CollectionFolder',
  'BoxSet',
  'UserView',
  'PlaylistsFolder',
])
const ITEM_FIELDS = 'PrimaryImageAspectRatio,MediaSources,Path,ParentId'

/** 服务端字幕编码 → 请求的输出格式；图形字幕（PGS、VobSub）不支持，返回 undefined */
export function subtitleFormat(codec: string | undefined): ProviderSubtitleFormat | undefined {
  const value = codec?.toLowerCase() ?? ''
  if (value === 'ass' || value === 'ssa') return 'ass'
  if (value === 'webvtt' || value === 'vtt') return 'vtt'
  if (['subrip', 'srt', 'mov_text', 'text', 'utf8'].includes(value)) return 'srt'
  return undefined
}

const basename = (value: string) => value.split(/[\\/]/).pop() || value

export function createJellyfinFamilyProvider(options: {
  family: JellyfinFamily
  sourceId: string
  url: string
  deviceId: string
  version: string
  token: string
  userId: string
}): MediaSourceProvider {
  const { family, sourceId, deviceId, version, token, userId } = options
  const base = options.url.replace(/\/+$/, '')
  const origin = new URL(base).origin
  const headers = authHeaders(family, deviceId, version, { token, userId })
  const fetcher = createAuthorizedFetcher(headers, origin)

  const api = async <T>(path: string, query: Record<string, string> = {}): Promise<T> => {
    const search = new URLSearchParams(query).toString()
    const response = await providerRequest(fetcher, `${base}${path}${search ? `?${search}` : ''}`, {
      headers: { Accept: 'application/json' },
    })
    try {
      return (await response.json()) as T
    } catch {
      throw new MediaSourceError('invalid_response')
    }
  }

  const getItem = (id: string) =>
    api<Item>(`/Users/${userId}/Items/${encodeURIComponent(id)}`, { Fields: ITEM_FIELDS })

  const listItems = async (query: Record<string, string>) =>
    (
      await api<{ Items?: Item[] }>(`/Users/${userId}/Items`, {
        Fields: ITEM_FIELDS,
        EnableImageTypes: 'Primary,Thumb,Backdrop',
        ...query,
      })
    ).Items ?? []

  const image = (item: Item, kind: SourceImageKind, width: number) => {
    const tag = item.ImageTags?.[kind]
    return tag ? sourceImageUrl(sourceId, item.Id, kind, width, tag) : undefined
  }

  function toNode(item: Item): BrowseNode | undefined {
    const title = item.Name ?? ''
    if (item.Type === 'Series')
      return {
        type: 'series',
        ref: item.Id,
        title,
        year: item.ProductionYear,
        image: image(item, 'Primary', 320),
      }
    if (item.Type === 'Season')
      return { type: 'season', ref: item.Id, title, image: image(item, 'Primary', 320) }
    if (item.Type === 'CollectionFolder' || item.Type === 'UserView')
      return {
        type: 'collection',
        ref: item.Id,
        title,
        wide: true,
        image: image(item, 'Primary', 480),
      }
    if (item.Type && FOLDER_TYPES.has(item.Type))
      return { type: 'folder', ref: item.Id, title, image: image(item, 'Primary', 320) }
    if (item.Type && VIDEO_TYPES.has(item.Type)) {
      const movie = item.Type === 'Movie'
      return {
        type: 'video',
        ref: item.Id,
        title,
        poster: movie,
        wide: !movie,
        index: item.Type === 'Episode' ? item.IndexNumber : undefined,
        duration: item.RunTimeTicks ? Math.round(item.RunTimeTicks / 10_000_000) : undefined,
        size: item.MediaSources?.[0]?.Size,
        image: image(item, 'Primary', 320),
      }
    }
    return undefined
  }

  const toNodes = (items: Item[]) =>
    items.map(toNode).filter((node): node is BrowseNode => node !== undefined)

  const episodeOrder = (a: Item, b: Item) =>
    (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0) ||
    (a.IndexNumber ?? Number.MAX_SAFE_INTEGER) - (b.IndexNumber ?? Number.MAX_SAFE_INTEGER) ||
    naturalCompare(a.Name ?? '', b.Name ?? '')

  const seasonEpisodes = async (seasonId: string) =>
    (await listItems({ ParentId: seasonId, IncludeItemTypes: 'Episode' })).sort(episodeOrder)

  async function children(item: Item): Promise<BrowseNode[]> {
    if (item.Type === 'Series') {
      const seasons = (await listItems({ ParentId: item.Id, IncludeItemTypes: 'Season' })).sort(
        (a, b) => (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0),
      )
      // 只有一季时跳过季这一层，直接给出单集
      if (seasons.length === 1) return toNodes(await seasonEpisodes(seasons[0].Id))
      return toNodes(seasons)
    }
    if (item.Type === 'Season') return toNodes(await seasonEpisodes(item.Id))
    if (item.CollectionType === 'tvshows')
      return toNodes(
        await listItems({
          ParentId: item.Id,
          IncludeItemTypes: 'Series',
          Recursive: 'true',
          SortBy: 'SortName',
        }),
      )
    if (item.CollectionType === 'movies')
      return toNodes(
        await listItems({
          ParentId: item.Id,
          IncludeItemTypes: 'Movie',
          Recursive: 'true',
          SortBy: 'SortName',
        }),
      )
    // 其他媒体库与文件夹按目录浏览
    return toNodes(
      await listItems({
        ParentId: item.Id,
        SortBy: 'IsFolder,SortName',
        SortOrder: 'Descending,Ascending',
      }),
    )
  }

  async function mediaSource(itemRef: string) {
    const item = await getItem(itemRef)
    if (!item.Type || !VIDEO_TYPES.has(item.Type)) throw new MediaSourceError('not_found')
    const source = item.MediaSources?.[0]
    if (!source?.Id) throw new MediaSourceError('not_found')
    return { item, source }
  }

  return {
    origin,
    authHeaders: () => headers,
    async browse(ref) {
      if (!ref) {
        const views = (await api<{ Items?: Item[] }>(`/Users/${userId}/Views`)).Items ?? []
        return {
          title: '',
          nodes: toNodes(views.map((view) => ({ ...view, Type: view.Type ?? 'CollectionFolder' }))),
        }
      }
      const item = await getItem(ref)
      return { title: item.Name ?? '', nodes: await children(item) }
    },
    async resolvePlayback(itemRef) {
      const { item, source } = await mediaSource(itemRef)
      // 弹幕匹配依赖原始文件名；/stream 路径推不出来，优先使用服务端记录的文件路径
      const path = source.Path ?? item.Path
      const name = path
        ? basename(path)
        : `${item.Name ?? 'video'}${source.Container ? `.${source.Container.split(',')[0]}` : ''}`
      const query = new URLSearchParams({ static: 'true', MediaSourceId: source.Id })
      return { url: `${base}/Videos/${encodeURIComponent(item.Id)}/stream?${query}`, name }
    },
    async siblings(itemRef) {
      const item = await getItem(itemRef)
      // 单集按同季连播；电影不自动连到下一部；其他视频按同一文件夹
      const items =
        item.Type === 'Episode' && (item.SeasonId ?? item.ParentId)
          ? await seasonEpisodes((item.SeasonId ?? item.ParentId)!)
          : item.Type === 'Movie' || !item.ParentId
            ? [item]
            : (await listItems({ ParentId: item.ParentId, SortBy: 'SortName' })).filter(
                (child) => child.Type && VIDEO_TYPES.has(child.Type),
              )
      return toNodes(items).filter((node): node is BrowseVideoNode => node.type === 'video')
    },
    async subtitles(itemRef): Promise<ProviderSubtitle[]> {
      const { source } = await mediaSource(itemRef)
      return (source.MediaStreams ?? []).flatMap((stream) => {
        if (stream.Type !== 'Subtitle' || stream.Index === undefined) return []
        const format = subtitleFormat(stream.Codec)
        if (!format || stream.IsTextSubtitleStream === false) return []
        return [
          {
            id: String(stream.Index),
            title: stream.DisplayTitle ?? stream.Title ?? stream.Language ?? `字幕 ${stream.Index}`,
            format,
            language: stream.Language,
          },
        ]
      })
    },
    async readSubtitle(itemRef, subtitleId) {
      const { item, source } = await mediaSource(itemRef)
      const stream = source.MediaStreams?.find(
        (candidate) => candidate.Type === 'Subtitle' && String(candidate.Index) === subtitleId,
      )
      const format = subtitleFormat(stream?.Codec)
      if (!stream || !format) throw new MediaSourceError('not_found')
      // 服务端负责从容器中抽取内嵌字幕，避免本地对远程文件分散读取；
      // 首次抽取大文件时服务端要读完整个容器，超时单独放宽
      const response = await providerRequest(
        fetcher,
        `${base}/Videos/${encodeURIComponent(item.Id)}/${encodeURIComponent(source.Id)}/Subtitles/${stream.Index}/Stream.${format}`,
        {},
        SUBTITLE_EXTRACT_TIMEOUT,
      )
      return readLimitedText(response, SUBTITLE_SIZE_LIMIT)
    },
    imageUrl(itemId, kind, width, tag) {
      const query = new URLSearchParams({ maxWidth: String(width), tag, quality: '90' })
      return `${base}/Items/${encodeURIComponent(itemId)}/Images/${kind}?${query}`
    },
  }
}

export function createJellyfinFamilyFactory(
  family: JellyfinFamily,
  clientVersion: () => string,
): ProviderFactory {
  return {
    async connect(input, deviceId) {
      const url = normalizeServerUrl(input.url, false).href.replace(/\/+$/, '')
      const version = clientVersion()
      const anonymous = createAuthorizedFetcher(
        authHeaders(family, deviceId, version, {}),
        new URL(url).origin,
      )
      const info = (await (
        await providerRequest(anonymous, `${url}/System/Info/Public`)
      )
        .json()
        .catch(() => {
          throw new MediaSourceError('invalid_response', '不是有效的服务器地址')
        })) as { Version?: string }
      if (!isSupportedVersion(family, info.Version))
        throw new MediaSourceError('unsupported_version')
      const response = await providerRequest(anonymous, `${url}/Users/AuthenticateByName`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ Username: input.username, Pw: input.password }),
      })
      const result = (await response.json().catch(() => ({}))) as {
        AccessToken?: string
        User?: { Id?: string }
        ServerId?: string
      }
      if (!result.AccessToken || !result.User?.Id) throw new MediaSourceError('invalid_response')
      // 只保存令牌，不保存密码；用户可在服务端注销设备使其失效
      return {
        url,
        credential: {
          type: 'token',
          token: result.AccessToken,
          userId: result.User.Id,
          serverId: result.ServerId ?? '',
        },
      }
    },
    create(source, deviceId) {
      if (source.credential.type !== 'token') throw new MediaSourceError('auth_failed')
      return createJellyfinFamilyProvider({
        family,
        sourceId: source.id,
        url: source.url,
        deviceId,
        version: clientVersion(),
        token: source.credential.token,
        userId: source.credential.userId,
      })
    },
  }
}
