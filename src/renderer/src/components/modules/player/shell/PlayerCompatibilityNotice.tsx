import type { PlayerCapabilities } from '@renderer/services/player-runtime'
import { playerEngineStateAtom } from '@renderer/atoms/player-engine'
import { usePlaybackViewModel } from '@renderer/services/player-runtime'
import { getCanvasSupport } from '@renderer/services/player-runtime/canvas-support'
import { useAtomValue } from 'jotai'
import { PlaybackFailure } from './PlaybackFailure'

export const PlayerCompatibilityNotice = ({
  onExit,
}: {
  capabilities: PlayerCapabilities
  onExit: () => void
}) => {
  const state = usePlaybackViewModel()
  const engine = useAtomValue(playerEngineStateAtom)
  const support = getCanvasSupport()
  if (engine?.switching) return null
  if (state.status !== 'error') {
    if (!engine?.error || (state.status !== 'idle' && state.status !== 'loading')) return null
    return (
      <PlaybackFailure
        description={
          support.supported
            ? '无法打开此视频，请检查文件格式或重新选择视频。'
            : '当前浏览器无法播放此视频，且不支持 Canvas 兼容播放。请换用桌面 Chrome / Edge 或其他格式的视频。'
        }
        detail={engine.error}
        onExit={onExit}
      />
    )
  }
  const compatibilityError = state.error.code === 'decode' || state.error.code === 'not-supported'
  const retry = Boolean(engine) && support.supported && compatibilityError
  const description =
    state.error.code === 'network'
      ? '媒体读取失败，请检查网络连接后重新打开视频。'
      : state.error.code === 'source-unavailable'
        ? '视频文件无法访问，请确认文件仍然存在并重新打开。'
        : compatibilityError && !support.supported
          ? '原生播放器无法播放这个文件，当前浏览器暂不支持 Canvas 兼容播放。请换用桌面 Chrome / Edge，或使用其他格式的视频。'
          : /audio track cannot be decoded/i.test(state.error.message)
            ? '当前音轨的编码暂不支持，无法开始播放。请使用包含受支持音轨的视频。'
            : '播放器无法读取或解码这个视频，请重试或打开其他视频。'
  return (
    <PlaybackFailure
      description={description}
      detail={state.error.message}
      onExit={onExit}
      onRetry={retry ? () => void engine?.retryCanvas() : undefined}
      retryLabel={engine?.actual === 'canvas' ? '重试兼容播放' : '使用兼容内核重试'}
    />
  )
}
