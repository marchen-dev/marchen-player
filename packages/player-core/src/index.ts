/**
 * @marchen/player-core
 *
 * 播放器加载流程的核心逻辑包。
 * 纯 TypeScript + RxJS，不依赖任何平台 API（DOM、Electron、IndexedDB）。
 * 通过 Port 接口（依赖注入）与外部系统交互。
 */

export { PlayerLoadingService } from './service'
export { INITIAL_STATE, mergeDanmakuEntries, reduce } from './state-machine'
export { VISIBLE_STEPS } from './types'

// 导出所有类型
export type {
  // 命令
  Command,
  // 数据
  CommentModel,
  CommentsData,
  // Port 接口
  DanmakuAPI,
  DanmakuCache,
  DanmakuEntry,
  ErrorState,
  HashingState,
  HistoryEntry,
  HistoryStore,
  IdleState,
  ImportingState,
  LoadingDanmakuState,
  // 状态
  LoadingState,
  MatchedVideo,
  MatchingState,
  MatchResult,
  // 事件
  PipelineEvent,
  PlayerBridge,
  PlayingState,
  PlayListItem,
  ReadyState,
  ReloadingState,
  ServiceDeps,
  SettingsReader,
  StepName,
  VideoImporter,
  VideoInfo,
  WaitingUserState,
} from './types'
