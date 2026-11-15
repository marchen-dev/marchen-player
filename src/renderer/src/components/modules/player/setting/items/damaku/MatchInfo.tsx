import { hidePlayerSettingsPanel } from '@renderer/atoms/player'
import { formatNumber } from '@renderer/lib/i18n'
import {
  usePlayerLoadingService,
  usePlayerLoadingState,
} from '@renderer/services/player-loading/hooks'
import { getMatchInfo } from '@renderer/services/player-loading/match-info'
import { useTranslation } from 'react-i18next'
import { showMatchAnimeDialog } from '../../../loading/dialog/hooks'

export const MatchInfo = () => {
  const state = usePlayerLoadingState()
  const service = usePlayerLoadingService()
  const { t } = useTranslation('danmaku')
  if (state.step !== 'ready' && state.step !== 'reloading') return null
  const info = getMatchInfo(state)
  const buttonClassName =
    'rounded-md px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--player-settings-focus)] focus-visible:outline-none disabled:opacity-40'

  return (
    <section data-player-match-info className="mb-6 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{t('matchInfo.title')}</h3>
        <div className="flex items-center gap-1">
          {info.matchFailed && (
            <button
              type="button"
              disabled={state.step === 'reloading'}
              className={buttonClassName}
              onClick={() => service.retryMatch()}
            >
              {t('matchInfo.retryMatch')}
            </button>
          )}
          {/* 后台加载中不提供重试，避免与进行中的请求重复 */}
          {info.canRetry && !info.pending && (
            <button
              type="button"
              disabled={state.step === 'reloading'}
              className={buttonClassName}
              onClick={() => service.retryDanmaku()}
            >
              {state.step === 'reloading' ? t('matchInfo.loading') : t('matchInfo.retryDanmaku')}
            </button>
          )}
          <button
            type="button"
            disabled={state.step === 'reloading'}
            className={buttonClassName}
            onClick={() => {
              hidePlayerSettingsPanel()
              showMatchAnimeDialog(true, state.video.hash)
            }}
          >
            {info.matched ? t('matchInfo.rematch') : t('matchInfo.match')}
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
            ? t('matchInfo.status.reloading')
            : info.pending === 'matching'
              ? t('matchInfo.status.matching')
              : info.pending === 'loading_danmaku'
                ? t('matchInfo.status.loadingDanmaku')
                : info.matchFailed
                  ? t('matchInfo.status.matchFailed')
                  : info.failed
                    ? t('matchInfo.status.failed')
                    : info.unmatched
                      ? t('matchInfo.status.unmatched')
                      : info.matched
                        ? t('matchInfo.status.matched', { total: formatNumber(info.count) })
                        : t('matchInfo.status.none')}
        </p>
      </div>
    </section>
  )
}
