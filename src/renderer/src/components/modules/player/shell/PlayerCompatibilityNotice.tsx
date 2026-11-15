import type { PlayerCapabilities } from '@renderer/services/player-runtime'
import { playerEngineStateAtom } from '@renderer/atoms/player-engine'
import { errorDetail } from '@renderer/lib/errors'
import {
  usePlayerLoadingService,
  usePlayerLoadingState,
} from '@renderer/services/player-loading/hooks'
import { usePlaybackViewModel } from '@renderer/services/player-runtime'
import { getCompatSupport } from '@renderer/services/player-runtime/compat-support'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'
import { openRemoteVideoDialog } from '../loading/RemoteVideoDialog'
import { PlaybackFailure } from './PlaybackFailure'

export const PlayerCompatibilityNotice = ({
  onExit,
}: {
  capabilities: PlayerCapabilities
  onExit: () => void
}) => {
  const loading = usePlayerLoadingState()
  const service = usePlayerLoadingService()
  const state = usePlaybackViewModel()
  const engine = useAtomValue(playerEngineStateAtom)
  const support = getCompatSupport()
  const { t } = useTranslation('player')
  if (engine?.switching) return null
  // 「查看错误详情」里的底层说明：播放内核的错误按错误码取对应语言的文案，
  // 取不到适合当前语言显示的内容时不显示这一栏
  const detail =
    (state.status === 'error'
      ? errorDetail(state.error, { domain: 'playback' })
      : errorDetail(engine?.error)) ?? undefined
  const source = 'video' in loading ? loading.video.source : undefined
  if (source?.kind === 'provider-item' && (state.status === 'error' || engine?.error))
    return (
      <PlaybackFailure
        description={t('failure.description.provider')}
        detail={detail}
        onExit={onExit}
        onRetry={() => service.loadFromProvider(source.sourceId, source.itemRef)}
      />
    )
  if (source?.kind === 'remote-url' && (state.status === 'error' || engine?.error))
    return (
      <PlaybackFailure
        description={t('failure.description.remote')}
        detail={detail}
        onExit={onExit}
        onRetry={() => service.loadFromUrl(source.url, source.hash)}
        onChangeSource={() => openRemoteVideoDialog(source.url, source.hash)}
      />
    )
  if (state.status !== 'error') {
    if (!engine?.error || (state.status !== 'idle' && state.status !== 'loading')) return null
    return (
      <PlaybackFailure
        description={
          support.supported
            ? t('failure.description.openFailed')
            : t('failure.description.unsupportedBrowser')
        }
        detail={detail}
        onExit={onExit}
      />
    )
  }
  const compatibilityError = state.error.code === 'decode' || state.error.code === 'not-supported'
  const retry = Boolean(engine) && support.supported && compatibilityError
  const description =
    state.error.code === 'network'
      ? t('failure.description.network')
      : state.error.code === 'source-unavailable'
        ? t('failure.description.sourceUnavailable')
        : compatibilityError && !support.supported
          ? t('failure.description.nativeUnsupported')
          : // 这条判断针对的是解码库给出的英文原始错误，没有对应的错误码可用
            /audio track cannot be decoded/i.test(state.error.message)
            ? t('failure.description.audioUnsupported')
            : t('failure.description.decode')
  return (
    <PlaybackFailure
      description={description}
      detail={detail}
      onExit={onExit}
      onRetry={retry ? () => void engine?.retryCompat() : undefined}
      retryLabel={
        engine?.actual === 'compat' ? t('failure.retryCompat') : t('failure.retryWithCompat')
      }
    />
  )
}
