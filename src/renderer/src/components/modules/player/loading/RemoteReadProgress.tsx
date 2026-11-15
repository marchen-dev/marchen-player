import {
  formatMediaBytes,
  remoteImportProgressAtom,
} from '@renderer/services/media/remote-progress'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'

export function RemoteReadProgress() {
  const progress = useAtomValue(remoteImportProgressAtom)
  const { t } = useTranslation('player')
  if (!progress) return null
  const percent = progress.total
    ? Math.min(100, Math.floor((progress.received / progress.total) * 100))
    : 0
  return (
    <div className="w-full max-w-sm space-y-2 text-sm">
      <p className="text-muted-foreground">
        {progress.stage === 'connecting'
          ? t('loading.status.connecting')
          : t('loading.remoteReading')}
      </p>
      {progress.stage === 'reading' && (
        <>
          <div
            role="progressbar"
            aria-label={t('loading.remoteProgressLabel')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="bg-muted h-1.5 overflow-hidden rounded-full"
          >
            <div
              className="bg-primary h-full transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-muted-foreground text-xs tabular-nums">
            {formatMediaBytes(progress.received)} / {formatMediaBytes(progress.total)} · {percent}%
          </p>
        </>
      )}
    </div>
  )
}
