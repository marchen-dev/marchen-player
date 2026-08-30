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

export interface PlaylistEntry {
  id: string
  name: string
  sourceUrl: string
}

export interface PlaylistPort {
  list: (currentSourceUrl: string) => Promise<ReadonlyArray<PlaylistEntry>>
  play: (entry: PlaylistEntry) => void
}

export interface SnapshotRequest {
  sourceUrl: string
  time: number
}

export interface SnapshotPort {
  capture: (request: SnapshotRequest) => Promise<string>
}

export interface SubtitleTrackDescriptor {
  id: string
  title: string
  language?: string
  origin: 'embedded' | 'external'
}

export interface ResolvedSubtitleTrack extends SubtitleTrackDescriptor {
  url: string
  persistencePath?: string
  release?: PlayerPortDisposer
}

export interface SubtitleCatalogPort {
  list: (sourceUrl: string) => Promise<ReadonlyArray<SubtitleTrackDescriptor>>
  importExternal: () => Promise<ResolvedSubtitleTrack | null>
  restoreExternal: (path: string, title: string, id?: string) => Promise<ResolvedSubtitleTrack>
  resolve: (sourceUrl: string, track: SubtitleTrackDescriptor) => Promise<ResolvedSubtitleTrack>
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
  prepare: (request: PlayerSourceRequest) => Promise<PlayerSourceHandle>
  release: (handle: PlayerSourceHandle) => void
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
