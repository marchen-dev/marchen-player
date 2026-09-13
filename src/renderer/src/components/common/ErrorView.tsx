import { ipcClient } from '@renderer/lib/client'
import { captureExceptionOnce } from '@renderer/services/telemetry/error-dedupe'
import { useEffect } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'

import { Button } from '../ui/button'

export default function ErrorView() {
  const error = useRouteError()

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
    : error instanceof Error
      ? error.message
      : String(error)

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-5">
      <p className="text-xl">糟糕发生错误了😭</p>
      <p className="text-lg">
        错误信息: <i>{message}</i>
      </p>
      <Button
        onClick={() => {
          ipcClient?.app.windowAction({ action: 'restart' })
        }}
      >
        重新加载页面
      </Button>
    </div>
  )
}
