import { ipcClient } from '@renderer/lib/client'
import { describeError } from '@renderer/lib/errors'
import { captureExceptionOnce } from '@renderer/services/telemetry/error-dedupe'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, useRouteError } from 'react-router'

import { Button } from '../ui/button'

export default function ErrorView() {
  const error = useRouteError()
  const { t } = useTranslation(['app', 'errors'])

  useEffect(() => {
    captureExceptionOnce(error, {
      handled: true,
      mechanism: isRouteErrorResponse(error) ? 'react-router.response' : 'react-router.error',
      level: 'error',
      errorCode: isRouteErrorResponse(error) ? `ROUTE_${error.status}` : undefined,
    })
  }, [error])

  const message = isRouteErrorResponse(error)
    ? error.statusText || String(error.status)
    : describeError(error, t('errors:generic.unknown'))

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-5">
      <p className="text-xl">{t('errorPage.title')}</p>
      <p className="text-lg">
        {t('errorPage.messageLabel')} <i>{message}</i>
      </p>
      <Button
        onClick={() => {
          ipcClient?.app.windowAction({ action: 'restart' })
        }}
      >
        {t('errorPage.reload')}
      </Button>
    </div>
  )
}
