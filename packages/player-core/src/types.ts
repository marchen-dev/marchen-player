/**
 * @marchen/player-core 类型定义
 *
 * 定义了加载流程的状态机、命令和 Port 接口。
 * Port 接口实现依赖反转：核心逻辑不依赖具体实现（API、数据库、IPC 等）。
 */

// ============================================================
// 基础数据类型
// ============================================================

/** 弹幕评论条目 */
export interface CommentModel {
  cid: number
  m: string
  p: string
}

/** 弹幕数据（API 返回格式） */
export interface CommentsData {
  count: number
  comments: CommentModel[]
}

/** 弹幕缓存条目（存储在 IndexedDB 中） */
export interface DanmakuEntry {
  type: 'auto' | 'local'
  source: string
  selected?: boolean
  content: CommentsData
}

/** 视频信息（导入后获得） */
export interface VideoInfo {
  url: string
  hash: string
  size: number
  name: string
  playList: PlayListItem[]
}

export interface PlayListItem {
  urlWithPrefix: string
  name: string
}

/** 匹配结果 */
export interface MatchResult {
  isMatched: boolean
  matches: MatchedVideo[]
}

/** 匹配到的动漫信息 */
export interface MatchedVideo {
  episodeId: number
  animeTitle: string
  episodeTitle: string
  animeId: number
}

/** 历史记录条目 */
export interface HistoryEntry {
  hash: string
  path: string
  episodeId?: number
  animeId?: number
  animeTitle?: string
  episodeTitle?: string
  danmaku?: DanmakuEntry[]
  newBangumi?: boolean
  [key: string]: unknown
}

// ============================================================
// 状态机：LoadingState（discriminated union）
// ============================================================

/** 加载流程的所有可能状态 */
export type LoadingState =
  | IdleState
  | ImportingState
  | HashingState
  | MatchingState
  | WaitingUserState
  | LoadingDanmakuState
  | ReadyState
  | PlayingState
  | ReloadingState
  | ErrorState

export interface IdleState {
  step: 'idle'
}

export interface ImportingState {
  step: 'importing'
}

export interface HashingState {
  step: 'hashing'
  video: Partial<VideoInfo>
}

export interface MatchingState {
  step: 'matching'
  video: VideoInfo
}

export interface WaitingUserState {
  step: 'waiting_user'
  video: VideoInfo
  matchData: MatchResult
}

export interface LoadingDanmakuState {
  step: 'loading_danmaku'
  video: VideoInfo
  match: MatchedVideo
}

export interface ReadyState {
  step: 'ready'
  video: VideoInfo
  match: MatchedVideo
  danmaku: DanmakuEntry[]
  mergedComments: CommentModel[]
}

export interface PlayingState {
  step: 'playing'
  video: VideoInfo
  match: MatchedVideo
  danmaku: DanmakuEntry[]
  mergedComments: CommentModel[]
}

export interface ReloadingState {
  step: 'reloading'
  video: VideoInfo
  match: MatchedVideo
  danmaku: DanmakuEntry[]
  mergedComments: CommentModel[]
}

export interface ErrorState {
  step: 'error'
  error: { message: string; previousStep: string }
}

// ============================================================
// 步骤名称（用于 UI 渲染 stepper）
// ============================================================

export type StepName = LoadingState['step']

/** stepper UI 显示的步骤（不含 idle/playing/reloading/error） */
export const VISIBLE_STEPS = [
  'importing',
  'hashing',
  'matching',
  'loading_danmaku',
  'ready',
] as const

// ============================================================
// Command：所有操作通过 command 触发
// ============================================================

export type Command =
  | { type: 'loadFromFile'; file: File }
  | { type: 'loadFromPath'; path: string }
  | { type: 'selectMatch'; match: MatchedVideo }
  | { type: 'skipDanmaku' }
  | { type: 'rematch'; match: MatchedVideo }
  | { type: 'addLocalDanmaku'; data: DanmakuEntry }
  | { type: 'cancel' }

// ============================================================
// Pipeline 内部事件（状态转换的触发器）
// ============================================================

export type PipelineEvent =
  | { type: 'started' }
  | { type: 'imported'; video: Partial<VideoInfo> }
  | { type: 'hashed'; video: VideoInfo }
  | { type: 'matched'; match: MatchedVideo }
  | { type: 'waitingUser'; matchData: MatchResult; video: VideoInfo }
  | { type: 'danmakuLoaded'; danmaku: DanmakuEntry[]; mergedComments: CommentModel[] }
  | { type: 'ready' }
  | { type: 'playing' }
  | { type: 'reloading' }
  | { type: 'reloaded'; danmaku: DanmakuEntry[]; mergedComments: CommentModel[] }
  | { type: 'error'; message: string; previousStep: string }
  | { type: 'cancelled' }

// ============================================================
// Port 接口：依赖反转，核心逻辑通过接口与外部交互
// ============================================================

/** 弹幕 API 接口 */
export interface DanmakuAPI {
  /** 通过文件 hash/size/name 匹配动漫 */
  match: (params: { hash: string; size: number; name: string }) => Promise<MatchResult>
  /** 获取弹幕（withRelated=true 包含第三方源） */
  getDanmu: (episodeId: number, opts: { withRelated: boolean; chConvert: number }) => Promise<CommentsData>
}

/** 弹幕缓存接口 */
export interface DanmakuCache {
  /** 获取缓存的弹幕数据 */
  get: (hash: string) => Promise<DanmakuEntry[] | null>
  /** 写入弹幕缓存 */
  set: (hash: string, data: DanmakuEntry[]) => Promise<void>
  /** 清空指定视频的弹幕缓存 */
  clear: (hash: string) => Promise<void>
  /** 判断缓存是否过期（新番返回 true） */
  isStale: (hash: string) => Promise<boolean>
}

/** 视频导入器接口（Electron/Web 各有实现） */
export interface VideoImporter {
  /** 从 File 对象导入（拖拽/点击选择） */
  importFromFile: (file: File) => Promise<VideoInfo>
  /** 从文件路径导入（IPC/历史记录） */
  importFromPath: (path: string) => Promise<VideoInfo>
}

/** 历史记录存储接口 */
export interface HistoryStore {
  /** 保存/更新历史记录 */
  save: (entry: HistoryEntry) => Promise<void>
  /** 读取历史记录 */
  get: (hash: string) => Promise<HistoryEntry | null>
}

/** 播放器桥接接口（播放中热更新弹幕） */
export interface PlayerBridge {
  /** 更新播放器的弹幕渲染 */
  updateDanmaku: (comments: CommentModel[]) => void
}

/** 设置读取接口 */
export interface SettingsReader {
  /** 获取繁简转换参数（0=不转换，1=繁转简） */
  getChConvert: () => number
}

// ============================================================
// Service 构造参数
// ============================================================

/** PlayerLoadingService 的依赖注入参数 */
export interface ServiceDeps {
  api: DanmakuAPI
  cache: DanmakuCache
  importer: VideoImporter
  history: HistoryStore
  settings: SettingsReader
}
