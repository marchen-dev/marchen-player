interface PlaybackFailureProps {
  description: string
  detail?: string
  onExit: () => void
  onRetry?: () => void
  retryLabel?: string
}

/** 播放终止错误统一使用此页；底层错误只作诊断详情，不直接作为用户文案。 */
export const PlaybackFailure = ({
  description,
  detail,
  onExit,
  onRetry,
  retryLabel,
}: PlaybackFailureProps) => (
  <div
    role="alert"
    data-player-compatibility-error
    className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
  >
    <div className="w-full max-w-md rounded-2xl border border-white/12 bg-zinc-900 p-6 text-center shadow-xl">
      <i className="icon-[mingcute--warning-line] text-4xl text-white/60" aria-hidden />
      <h2 className="mt-4 text-xl font-semibold text-white">无法播放此视频</h2>
      <p className="mt-3 text-sm leading-6 text-white/70">{description}</p>
      {detail && (
        <details className="mt-4 text-left text-xs text-white/50">
          <summary className="py-2">查看错误详情</summary>
          <p className="max-h-32 overflow-auto break-words select-text">{detail}</p>
        </details>
      )}
      <div className="mt-6 flex justify-center gap-3">
        {onRetry && (
          <button
            type="button"
            className="min-h-11 rounded-lg bg-white px-4 text-sm font-semibold text-black"
            onClick={onRetry}
          >
            {retryLabel ?? '重试播放'}
          </button>
        )}
        <button
          type="button"
          className="min-h-11 rounded-lg border border-white/15 px-4 text-sm text-white hover:bg-white/8"
          onClick={onExit}
        >
          退出当前播放
        </button>
      </div>
    </div>
  </div>
)
