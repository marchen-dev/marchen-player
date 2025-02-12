import { tipcClient } from '@renderer/lib/client'
import { RouteName } from '@renderer/router'
import { useLocation, useNavigate, useRouteError } from 'react-router'

import { Button } from '../ui/button'

export default function ErrorView() {
  const error = useRouteError() as { statusText: string; message: string }
  const location = useLocation()
  const navigate = useNavigate()
  console.error(error)

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6">
      <p className="text-xl">糟糕发生错误了😭</p>
      <div className="space-y-4 text-lg">
        <p>
          错误信息: <i>{error?.statusText ?? error?.message}</i>
        </p>
        <p>
          当前路由: <i>{location.pathname}</i>
        </p>
      </div>
      <div className='space-x-4'>
        <Button
          onClick={() => {
            navigate(RouteName.PLAYER)
          }}
        >
          返回首页
        </Button>

        <Button
          onClick={() => {
            tipcClient?.windowAction({ action: 'restart' })
          }}
        >
          重新加载页面
        </Button>
      </div>
    </div>
  )
}
