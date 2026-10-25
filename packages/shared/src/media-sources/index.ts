/**
 * 媒体源（WebDAV / Jellyfin / Emby）在 main 与 renderer 之间共享的类型。
 *
 * 凭证只存在于主进程；这里的类型都是 renderer 可以看到的形态，
 * 不包含密码、令牌或拼好的带鉴权地址。
 */

export const MEDIA_SOURCE_KINDS = ['webdav', 'jellyfin', 'emby'] as const
export type MediaSourceKind = (typeof MEDIA_SOURCE_KINDS)[number]

export const MEDIA_SOURCE_KIND_LABELS: Record<MediaSourceKind, string> = {
  webdav: 'WebDAV',
  jellyfin: 'Jellyfin',
  emby: 'Emby',
}

/** 稳定错误码：renderer 据此选择提示文案，遥测据此聚合，不依赖 message。 */
export const MEDIA_SOURCE_ERROR_CODES = [
  'auth_failed',
  'forbidden',
  'unreachable',
  'certificate',
  'unsupported_version',
  'range_unsupported',
  'not_found',
  'content_changed',
  'source_removed',
  'invalid_input',
  'invalid_response',
] as const
export type MediaSourceErrorCode = (typeof MEDIA_SOURCE_ERROR_CODES)[number]

export const MEDIA_SOURCE_ERROR_MESSAGES: Record<MediaSourceErrorCode, string> = {
  auth_failed: '账号或密码错误，或登录已失效',
  forbidden: '当前账号没有访问权限',
  unreachable: '无法连接服务器，请检查地址和网络',
  certificate: '服务器证书不受信任，暂不支持自签名证书',
  unsupported_version: '服务器版本过低，请升级后再试',
  range_unsupported: '该来源不支持按需读取，无法播放',
  not_found: '内容不存在或已被移动',
  content_changed: '视频内容已变化',
  source_removed: '媒体源已被移除',
  invalid_input: '填写的信息无效',
  invalid_response: '服务器返回了无法识别的内容',
}

/** 跨 IPC 时 Error 的自定义字段会丢失，因此统一转成结果对象传递。 */
export class MediaSourceError extends Error {
  constructor(
    public readonly code: MediaSourceErrorCode,
    message: string = MEDIA_SOURCE_ERROR_MESSAGES[code],
  ) {
    super(message)
    this.name = 'MediaSourceError'
  }
}

export const isMediaSourceErrorCode = (value: unknown): value is MediaSourceErrorCode =>
  typeof value === 'string' && (MEDIA_SOURCE_ERROR_CODES as readonly string[]).includes(value)

export type MediaSourceResult<T> =
  { ok: true; value: T } | { ok: false; code: MediaSourceErrorCode; message: string }

/** 来源摘要：总览卡片和表单回填使用，不含任何凭证。 */
export interface MediaSourceSummary {
  id: string
  kind: MediaSourceKind
  name: string
  url: string
  username: string
  /** 服务端返回 401 后标记，需要用户重新登录。 */
  needsLogin: boolean
  createdAt: string
}

/** 添加 / 编辑 / 重新登录时的表单输入；password 只在这次调用中经过 IPC，不回传。 */
export interface MediaSourceInput {
  kind: MediaSourceKind
  name: string
  url: string
  username: string
  password: string
}

export type BrowseContainerType = 'collection' | 'series' | 'season' | 'folder'

interface BrowseNodeBase {
  /** 在所属来源内唯一、可再次传给 browse / 播放的引用；WebDAV 是路径，Jellyfin/Emby 是 ItemId。 */
  ref: string
  title: string
  /** 海报地址，Jellyfin/Emby 为 marchen://source-image 代理地址；WebDAV 没有。 */
  image?: string
  /** 横版图（媒体库卡片、单集缩略图）优先使用。 */
  wide?: boolean
}

export interface BrowseContainerNode extends BrowseNodeBase {
  type: BrowseContainerType
  year?: number
}

export interface BrowseVideoNode extends BrowseNodeBase {
  type: 'video'
  /** 秒 */
  duration?: number
  size?: number
  /** 集号，仅 Jellyfin/Emby 单集提供 */
  index?: number
  /** 电影这类以海报展示的视频 */
  poster?: boolean
}

export type BrowseNode = BrowseContainerNode | BrowseVideoNode

export interface BrowseResult {
  /** 当前层级的标题；根层级为来源名 */
  title: string
  nodes: BrowseNode[]
}

export type ProviderSubtitleFormat = 'ass' | 'ssa' | 'srt' | 'vtt'

export interface ProviderSubtitle {
  /** 在条目内稳定，用于 HISTORY 恢复字幕选择 */
  id: string
  title: string
  format: ProviderSubtitleFormat
  language?: string
}

/** 打开 provider 条目后由主进程返回的租约信息，不含上游地址。 */
export interface ProviderMediaLease {
  id: string
  url: string
  name: string
  size: number
  kind: MediaSourceKind
}

export const SOURCE_IMAGE_HOST = 'source-image'
export const SOURCE_IMAGE_KINDS = ['Primary', 'Thumb', 'Backdrop'] as const
export type SourceImageKind = (typeof SOURCE_IMAGE_KINDS)[number]
export const SOURCE_IMAGE_WIDTHS = [160, 320, 480, 640] as const

/** 宽度向上取整到固定档位，限制同一张图的缓存变体数量。 */
export const bucketImageWidth = (width: number): number =>
  SOURCE_IMAGE_WIDTHS.find((bucket) => bucket >= width) ?? SOURCE_IMAGE_WIDTHS.at(-1)!
