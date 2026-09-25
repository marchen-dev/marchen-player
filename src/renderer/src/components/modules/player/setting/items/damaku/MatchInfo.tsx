import { hidePlayerSettingsPanel } from '@renderer/atoms/player'
import {
  usePlayerLoadingService,
  usePlayerLoadingState,
} from '@renderer/services/player-loading/hooks'
import { getMatchInfo } from '@renderer/services/player-loading/match-info'
import { showMatchAnimeDialog } from '../../../loading/dialog/hooks'

export const MatchInfo = () => {
  const state = usePlayerLoadingState()
  const service = usePlayerLoadingService()
  if (state.step !== 'ready' && state.step !== 'reloading') return null
  const info = getMatchInfo(state)

  return (
    <section data-player-match-info className="mb-6 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">匹配信息</h3>
        <div className="flex items-center gap-1">
          {info.canRetry && (
            <button
              type="button"
              disabled={state.step === 'reloading'}
              className="rounded-md px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--player-settings-focus)] focus-visible:outline-none disabled:opacity-40"
              onClick={() => service.retryDanmaku()}
            >
              {state.step === 'reloading' ? '正在加载…' : '重试弹幕'}
            </button>
          )}
          <button
            type="button"
            disabled={state.step === 'reloading'}
            className="rounded-md px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--player-settings-focus)] focus-visible:outline-none disabled:opacity-40"
            onClick={() => {
              hidePlayerSettingsPanel()
              showMatchAnimeDialog(true, state.video.hash)
            }}
          >
            {info.matched ? '重新匹配' : '匹配动漫'}
          </button>
        </div>
      </div>
      <div className="space-y-2 rounded-xl bg-white/8 p-4 text-sm">
        <p className="font-medium break-words">{info.title}</p>
        {info.episode && (
          <p className="break-words text-[var(--player-settings-muted)]">{info.episode}</p>
        )}
        <p className="text-xs text-[var(--player-settings-muted)]">
          {state.step === 'reloading'
            ? '正在加载弹幕…'
            : info.failed
              ? '弹幕加载失败，视频可正常播放'
              : info.skipped
                ? '已跳过在线弹幕加载'
                : info.matched
                  ? `匹配弹幕 ${info.count.toLocaleString('zh-CN')} 条`
                  : '尚未匹配动漫'}
        </p>
      </div>
    </section>
  )
}
