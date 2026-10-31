/**
 * 状态机：定义状态转换规则
 *
 * 纯函数 reduce：接收当前状态 + 事件，返回新状态。
 * 不包含副作用，所有异步操作在 pipeline 中处理。
 */

import type { LoadingState, PipelineEvent } from './types'

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

    case 'matchFailed':
      return { step: 'match_failed', video: event.video, error: { message: event.message } }

    case 'matched': {
      // 精准匹配成功或用户手动选择后，进入加载弹幕阶段
      // 可以从 matching（自动匹配）或 waiting_user（用户选择）状态转入
      if (state.step !== 'matching' && state.step !== 'waiting_user') return state
      const video = 'video' in state ? state.video : undefined
      if (!video) return state
      return {
        step: 'loading_danmaku',
        video,
        match: event.match,
        matchOrigin: event.matchOrigin ?? 'manual',
      }
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
        matchOrigin: state.matchOrigin,
        danmakuLoadFailed: event.danmakuLoadFailed,
        danmakuStatus: event.danmakuLoadFailed ? 'failed' : 'loaded',
        danmaku: event.danmaku,
        mergedComments: event.mergedComments,
      }
    }

    case 'ready': {
      // 准备就绪，即将开始播放
      if (state.step !== 'ready') return state
      return { ...state, step: 'ready' }
    }

    case 'playNowReady':
      // 只接受点击时所在的步骤；读取本地数据期间被切走（切集、取消）则丢弃
      if (state.step !== event.from || state.video !== event.video) return state
      return {
        step: 'ready',
        video: event.video,
        match: event.match,
        matchOrigin: event.matchOrigin,
        // 后台进行中不下结论；否则开播即为未匹配或匹配失败，与优先播放后台结束的结果一致
        danmakuStatus: event.background
          ? undefined
          : event.matchError
            ? 'failed'
            : event.candidates
              ? 'unmatched'
              : 'loaded',
        background: event.background ? { phase: event.background } : undefined,
        matchCandidates: event.candidates,
        matchError: event.matchError,
        playNowFrom: event.from,
        danmaku: event.danmaku,
        mergedComments: event.mergedComments,
      }

    case 'playFirstReady':
      // 优先播放只从本地探测阶段进入；其他状态说明加载已被切走
      if (state.step !== 'matching' || state.video !== event.video) return state
      return {
        step: 'ready',
        video: event.video,
        match: event.match,
        matchOrigin: event.matchOrigin,
        danmakuStatus: event.background ? undefined : 'loaded',
        background: event.background ? { phase: event.background } : undefined,
        danmaku: event.danmaku,
        mergedComments: event.mergedComments,
      }

    case 'backgroundStarted':
      if (state.step !== 'ready') return state
      return {
        ...state,
        background: { phase: event.phase },
        matchError: undefined,
        danmakuStatus: undefined,
        // 用户在播放中主动重试，结果按正常后台流程反馈
        playNowFrom: undefined,
      }

    case 'backgroundPhase':
      if (state.step !== 'ready' || !state.background) return state
      return { ...state, background: { phase: event.phase } }

    case 'backgroundSettled':
      // 只接受仍在后台阶段的 ready；用户操作或切集后到达的结果一律丢弃
      if (state.step !== 'ready' || !state.background) return state
      return {
        ...state,
        match: event.match,
        matchOrigin: event.matchOrigin,
        background: undefined,
        matchCandidates: undefined,
        matchError: undefined,
        danmakuLoadFailed: event.danmakuLoadFailed,
        danmakuStatus: event.danmakuLoadFailed ? 'failed' : 'loaded',
        danmaku: event.danmaku,
        mergedComments: event.mergedComments,
      }

    case 'backgroundUnmatched':
      if (state.step !== 'ready' || !state.background) return state
      return {
        ...state,
        background: undefined,
        matchCandidates: event.candidates,
        danmakuStatus: 'unmatched',
      }

    case 'backgroundMatchFailed':
      if (state.step !== 'ready' || !state.background) return state
      return {
        ...state,
        background: undefined,
        matchError: { message: event.message },
        danmakuStatus: 'failed',
      }

    case 'reloading': {
      // ready 数据重新加载弹幕；用户操作优先于后台阶段，进入后即结束后台展示
      if (state.step !== 'ready') return state
      return {
        ...state,
        step: 'reloading',
        background: undefined,
        matchError: undefined,
        playNowFrom: undefined,
        recovery: { target: event.target ?? state.match },
      }
    }

    case 'reloaded': {
      // 重新加载完成，回到稳定 ready 状态
      if (state.step !== 'reloading') return state
      return {
        ...state,
        step: 'ready',
        match: event.match,
        matchOrigin: event.match === state.match ? state.matchOrigin : 'manual',
        danmakuLoadFailed: false,
        danmakuStatus: 'loaded',
        recovery: undefined,
        matchCandidates: undefined,
        danmaku: event.danmaku,
        mergedComments: event.mergedComments,
      }
    }

    case 'reloadFailed':
      if (state.step !== 'reloading') return state
      return { ...state, step: 'ready', recovery: { target: event.target, message: event.message } }

    case 'error':
      return {
        step: 'error',
        error: { message: event.message, previousStep: event.previousStep },
        remoteRequest: event.remoteRequest,
        providerRequest: event.providerRequest,
      }

    case 'cancelled':
      return INITIAL_STATE

    default:
      return state
  }
}

/**
 * 合并弹幕：将所有 selected 的弹幕源合并为一个 CommentModel 数组
 */
export { mergeSources as mergeDanmakuEntries } from '@marchen/shared/danmaku'
