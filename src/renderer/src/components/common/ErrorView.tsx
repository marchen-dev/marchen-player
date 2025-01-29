import { tipcClient } from '@renderer/lib/client'
import { useRouteError } from 'react-router'

import { Button } from '../ui/button'

export default function ErrorView() {
  const error = useRouteError() as { statusText: string; message: string }
  console.error(error)

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-5">
      <p className="text-xl">糟糕发生错误了😭</p>
      <p className="text-lg">
        错误信息: <i>{error?.statusText ?? error?.message}</i>
      </p>
      <Button
        onClick={() => {
          tipcClient?.windowAction({ action: 'restart' })
        }}
      >
        重新加载页面
      </Button>
    </div>
  )
}
