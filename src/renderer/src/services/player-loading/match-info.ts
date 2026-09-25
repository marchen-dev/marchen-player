import type { ReadyState, ReloadingState } from '@marchen/player-loading'

/** 匹配库实际加载的数量不受显示开关影响，也不包含另行导入的本地弹幕。 */
export function getMatchInfo(state: ReadyState | ReloadingState) {
  const matched = state.match.episodeId > 0
  return {
    matched,
    title: matched ? state.match.animeTitle || state.video.name : state.video.name,
    episode: matched ? state.match.episodeTitle : '',
    count: state.danmaku
      .filter((entry) => entry.type === 'auto')
      .reduce((total, entry) => total + entry.content.comments.length, 0),
    failed: Boolean(state.danmakuLoadFailed || state.recovery?.message),
    skipped: state.danmakuStatus === 'skipped',
    canRetry: (state.recovery?.target.episodeId ?? state.match.episodeId) > 0,
    recoveryFailed: Boolean(state.recovery?.message),
  }
}
