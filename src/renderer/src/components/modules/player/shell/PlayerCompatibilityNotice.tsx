import type { PlayerCapabilities } from '@renderer/services/player-runtime'
import { usePlaybackViewModel } from '@renderer/services/player-runtime'

const DESKTOP_RELEASE_URL = 'https://github.com/marchen-dev/marchen-player/releases/latest'

export const PlayerCompatibilityNotice = ({
  capabilities,
  onExit,
}: {
  capabilities: PlayerCapabilities
  onExit: () => void
}) => {
  const state = usePlaybackViewModel()
  if (state.status !== 'error' || capabilities.platform !== 'web') return null
  if (state.error.code !== 'decode' && state.error.code !== 'not-supported') return null

  return (
    <div
      role="alert"
      data-player-compatibility-error
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[var(--player-surface-solid)] p-6 text-center shadow-[var(--player-shadow)]">
        <i className="icon-[mingcute--warning-line] text-4xl text-amber-300" aria-hidden />
        <h2 className="mt-3 text-xl font-semibold text-white">浏览器无法播放这个视频</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--player-fg-muted)]">
          当前浏览器不支持文件里的视频或音频编码。Marchen Web 不会上传你的视频，也不会在浏览器里启动
          FFmpeg WASM 转码。
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--player-fg-muted)]">
          可改用桌面版继续播放本地文件，或退出后选择浏览器原生支持的格式。
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <a
            href={DESKTOP_RELEASE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-4 text-sm font-semibold text-black focus-visible:ring-2 focus-visible:ring-[var(--player-focus)] focus-visible:outline-none"
          >
            下载桌面版
          </a>
          <button
            type="button"
            className="min-h-11 rounded-lg border border-white/15 px-4 text-sm text-white hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-[var(--player-focus)] focus-visible:outline-none"
            onClick={onExit}
          >
            退出当前播放
          </button>
        </div>
      </div>
    </div>
  )
}
