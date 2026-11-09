import type { DurableMediaSource } from '@marchen/shared/media'
import type { PgsSubtitleSession } from '@renderer/services/media/subtitles/pgs/session'
import type { PlayerCapabilities } from './types'

export type PlayerPortDisposer = () => void

export interface FullscreenSnapshot {
  active: boolean
  mode: 'dom' | 'window'
}

export interface FullscreenPort {
  readonly mode: FullscreenSnapshot['mode']
  getSnapshot: () => FullscreenSnapshot
  enter: (root: HTMLElement) => Promise<void>
  exit: () => Promise<void>
  toggle: (root: HTMLElement) => Promise<void>
  subscribe: (listener: (snapshot: FullscreenSnapshot) => void) => PlayerPortDisposer
}

export type PlaylistEntry = { id: string; name: string; fileHash?: string } & (
  | { path: string; file?: never; provider?: never }
  | { file: File; path?: never; provider?: never }
  /** 媒体源条目：同目录或同季视频，播放时由主进程重新解析地址 */
  | { provider: { sourceId: string; itemRef: string }; path?: never; file?: never }
)

export interface PlaylistPort {
  list: (currentSource: DurableMediaSource) => Promise<ReadonlyArray<PlaylistEntry>>
  play: (entry: PlaylistEntry) => void
}

export interface SnapshotRequest {
  source: DurableMediaSource
  time: number
  rotation?: 0 | 90 | 180 | 270
  signal?: AbortSignal
}

export interface SnapshotPort {
  capture: (request: SnapshotRequest) => Promise<string>
}

export interface SubtitleTrackDescriptor {
  id: string
  title: string
  language?: string
  origin: 'embedded' | 'external'
  embedded?: { number: number; uid: string; codec: string }
  supported?: boolean
  /** 文本字幕交给 libass；位图字幕（PGS）走位图会话。未声明时按文本处理 */
  kind?: 'text' | 'bitmap'
  /**
   * 外挂轨道在 HISTORY 中的稳定标识（写入 tag.path）。
   * 媒体源字幕每次重新列出，靠它把列表中的轨道与历史选择对上，而不是重新分配 id。
   */
  persistenceKey?: string
}

interface ResolvedSubtitleCommon extends SubtitleTrackDescriptor {
  warning?: string
  release?: PlayerPortDisposer
}

/** 文本字幕：完整内容通过 URL 交给 libass */
export interface ResolvedTextSubtitleTrack extends ResolvedSubtitleCommon {
  kind: 'text'
  fonts?: readonly string[]
  url: string
  persistencePath?: string
  persistenceContent?: string
}

/**
 * 位图字幕：会话持有读取租约，按播放位置窗口读取并产出位图。
 * release 会关闭会话（Worker 与租约），不影响播放器自身的读取。
 */
export interface ResolvedBitmapSubtitleTrack extends ResolvedSubtitleCommon {
  kind: 'bitmap'
  session: BitmapSubtitleSession
}

export type BitmapSubtitleSession = PgsSubtitleSession

/** 用 kind 区分模式，不靠 url 是否为空猜测 */
export type ResolvedSubtitleTrack = ResolvedTextSubtitleTrack | ResolvedBitmapSubtitleTrack

export interface SubtitleCatalogPort {
  list: (
    source: DurableMediaSource,
    signal?: AbortSignal,
  ) => Promise<ReadonlyArray<SubtitleTrackDescriptor>>
  importExternal: () => Promise<ResolvedSubtitleTrack | null>
  restoreExternal: (
    path: string | undefined,
    title: string,
    id?: string,
    content?: string,
  ) => Promise<ResolvedSubtitleTrack>
  resolve: (
    source: DurableMediaSource,
    track: SubtitleTrackDescriptor,
    signal?: AbortSignal,
  ) => Promise<ResolvedSubtitleTrack>
}

export type PlayerSourceRequest =
  | { kind: 'url'; url: string }
  | { kind: 'file'; file: File }
  | { kind: 'blob'; blob: Blob; name?: string }

export interface PlayerSourceHandle {
  id: string
  url: string
  release: PlayerPortDisposer
}

/** Source handle 的 owner 必须只释放一次；dispose 负责回收仍存活的 handle。 */
export interface SourceLifecyclePort {
  prepareResource: (request: PlayerSourceRequest) => Promise<PlayerSourceHandle>
  releaseResource: (handle: PlayerSourceHandle) => void
  dispose: () => void
}

export interface PlayerPorts {
  capabilities: PlayerCapabilities
  fullscreen: FullscreenPort
  sourceLifecycle: SourceLifecyclePort
  playlist?: PlaylistPort
  snapshot?: SnapshotPort
  subtitles?: SubtitleCatalogPort
}
