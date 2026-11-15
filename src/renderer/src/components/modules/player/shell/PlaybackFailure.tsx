import { openFeedbackDialog } from '@renderer/atoms/feedback'
import { getLastImportOperationId } from '@renderer/services/telemetry/local-log'
import { useTranslation } from 'react-i18next'

interface PlaybackFailureProps {
  description: string
  detail?: string
  onExit: () => void
  onChangeSource?: () => void
  onRetry?: () => void
  retryLabel?: string
}

/** 播放终止错误统一使用此页；底层错误只作诊断详情，不直接作为用户文案。 */
export const PlaybackFailure = ({
  description,
  detail,
  onExit,
  onRetry,
  onChangeSource,
  retryLabel,
}: PlaybackFailureProps) => {
  const { t } = useTranslation('player')
  return (
  <div
    role="alert"
    data-player-compatibility-error
    className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
  >
    <div className="w-full max-w-md rounded-2xl border border-white/12 bg-player-popover p-6 text-center shadow-xl">
      <i className="icon-[mingcute--warning-line] text-4xl text-white/60" aria-hidden />
      <h2 className="mt-4 text-xl font-semibold text-white">{t('failure.title')}</h2>
      <p className="mt-3 text-sm leading-6 text-white/70">{description}</p>
      {detail && (
        <details className="mt-4 text-left text-xs text-white/50">
          <summary className="py-2">{t('failure.details')}</summary>
          <p className="max-h-32 overflow-auto break-words select-text">{detail}</p>
        </details>
      )}
      <div className="mt-6 flex justify-center gap-3">
        {onChangeSource && (
          <button
            type="button"
            className="min-h-11 rounded-lg border border-white/15 px-4 text-sm text-white"
            onClick={onChangeSource}
          >
            {t('failure.changeLink')}
          </button>
        )}
        {onRetry && (
          <button
            type="button"
            className="min-h-11 rounded-lg bg-white px-4 text-sm font-semibold text-black"
            onClick={onRetry}
          >
            {retryLabel ?? t('failure.retry')}
          </button>
        )}
        <button
          type="button"
          className="min-h-11 rounded-lg border border-white/15 px-4 text-sm text-white hover:bg-white/8"
          onClick={onExit}
        >
          {t('failure.exit')}
        </button>
      </div>
      <button
        type="button"
        className="mt-4 text-xs text-white/50 underline-offset-4 hover:text-white/80 hover:underline"
        onClick={() => {
          // Web 全屏作用于播放器元素，弹窗挂在 body 上会被遮挡，先退出全屏
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
          // 预填失败说明与底层错误，并关联最近一次导入操作，后台可直接定位这次失败
          openFeedbackDialog({
            source: 'playback_error',
            prefill: detail
              ? t('failure.feedbackPrefillWithDetail', { description, detail })
              : t('failure.feedbackPrefill', { description }),
            operationId: getLastImportOperationId(),
          })
        }}
      >
        {t('failure.feedback')}
      </button>
    </div>
  </div>
  )
}
