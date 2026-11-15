import type { DB_History } from '@renderer/database/schemas/history'
import { videoAtom } from '@renderer/atoms/player'
import { db } from '@renderer/database/db'
import { usePlayerLoadingSelector } from '@renderer/services/player-loading/hooks'
import { useQuery } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { createContext, use } from 'react'
import { useTranslation } from 'react-i18next'

export const danmakuSourceQueryKey = 'player-danmaku-source'

const DanmakuSourceContext = createContext<DB_History | null>(null)

export const DanmakuSourceProvider = ({ children }: React.PropsWithChildren) => {
  const { t } = useTranslation('player')
  const { hash } = useAtomValue(videoAtom)
  const activeDanmaku = usePlayerLoadingSelector((state) =>
    (state.step === 'ready' || state.step === 'reloading') && state.video.hash === hash
      ? state.danmaku
      : undefined,
  )
  const { data, error, isPending } = useQuery({
    queryKey: [danmakuSourceQueryKey, hash],
    queryFn: () => db.history.get(hash),
    enabled: Boolean(hash),
  })

  if (isPending) {
    return (
      <p className="text-sm text-[var(--player-settings-muted)]">
        {t('settingsPanel.danmakuSources.loading')}
      </p>
    )
  }
  if (error) {
    return <p className="text-sm text-red-300">{t('settingsPanel.danmakuSources.failed')}</p>
  }
  if (!data) {
    return (
      <p className="text-sm text-[var(--player-settings-muted)]">
        {t('settingsPanel.danmakuSources.empty')}
      </p>
    )
  }
  return (
    <DanmakuSourceContext value={{ ...data, danmaku: activeDanmaku ?? data.danmaku }}>
      {children}
    </DanmakuSourceContext>
  )
}

export const useDanmakuSourceConfig = () => {
  const context = use(DanmakuSourceContext)
  if (!context) throw new Error('useDanmakuSourceConfig must be used within DanmakuSourceProvider')
  return context
}
