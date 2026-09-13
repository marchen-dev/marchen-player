/**
 * 状态机：定义状态转换规则
 *
 * 纯函数 reduce：接收当前状态 + 事件，返回新状态。
 * 不包含副作用，所有异步操作在 pipeline 中处理。
 */

import type { DanmakuEntry, LoadingState, PipelineEvent } from './types'

/** 初始状态 */
export const INITIAL_STATE: LoadingState = { step: 'idle' }

/**
 * 状态转换函数
 * 根据当前状态和事件计算下一个状态
 */
export function reduce(state: LoadingState, event: PipelineEvent): LoadingState {
  switch (event.type) {
    case 'started':
      return { step: 'importing' }

    case 'imported':
      return { step: 'hashing', video: event.video }

    case 'hashed':
      return { step: 'matching', video: event.video }

    case 'matched': {
      // 精准匹配成功或用户手动选择后，进入加载弹幕阶段
      // 可以从 matching（自动匹配）或 waiting_user（用户选择）状态转入
      if (state.step !== 'matching' && state.step !== 'waiting_user') return state
      const video = 'video' in state ? state.video : undefined
      if (!video) return state
      return { step: 'loading_danmaku', video, match: event.match }
    }

    case 'waitingUser': {
      // 未精准匹配，等待用户选择
      return { step: 'waiting_user', video: event.video, matchData: event.matchData }
    }

    case 'danmakuLoaded': {
      // 弹幕加载完成
      if (state.step !== 'loading_danmaku') return state
      return {
        step: 'ready',
        video: state.video,
        match: state.match,
        danmaku: event.danmaku,
        mergedComments: event.mergedComments,
      }
    }

    case 'ready': {
      // 准备就绪，即将开始播放
      if (state.step !== 'ready') return state
      return { ...state, step: 'ready' }
    }

    case 'skipped':
      if (state.step !== 'waiting_user') return state
      return {
        step: 'ready',
        video: event.video,
        match: { episodeId: 0, animeTitle: '', episodeTitle: '', animeId: 0 },
        danmaku: event.danmaku,
        mergedComments: event.mergedComments,
      }

    case 'reloading': {
      // ready 数据重新加载弹幕
      if (state.step !== 'ready') return state
      return { ...state, step: 'reloading' }
    }

    case 'reloaded': {
      // 重新加载完成，回到稳定 ready 状态
      if (state.step !== 'reloading') return state
      return {
        ...state,
        step: 'ready',
        match: event.match,
        danmaku: event.danmaku,
        mergedComments: event.mergedComments,
      }
    }

    case 'error':
      return { step: 'error', error: { message: event.message, previousStep: event.previousStep } }

    case 'cancelled':
      return INITIAL_STATE

    default:
      return state
  }
}

/**
 * 合并弹幕：将所有 selected 的弹幕源合并为一个 CommentModel 数组
 */
export function mergeDanmakuEntries(entries: DanmakuEntry[]) {
  return entries.filter((entry) => entry.selected).flatMap((entry) => entry.content.comments)
}
