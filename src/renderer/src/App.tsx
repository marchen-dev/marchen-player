import type { JSX } from 'react'

import { AppHeader } from './components/layout/app-header/AppHeader'
import { RootLayout } from './components/layout/root/RootLayout'
import { Sidebar } from './components/layout/sidebar'
import { Prepare } from './components/modules/app/Prepare'
import AnimatedOutlet from './components/ui/animate/AnimatedOutlet'
import { useNetworkToast } from './hooks/use-network-toast'
import { useUpdateToast } from './hooks/use-update-toast'
import { isWeb } from './lib/utils'
import { RootProviders } from './providers'
import { IpcListener } from './providers/IpcListener'

function App(): JSX.Element {
  return (
    <RootProviders>
      <Prepare />

      <RootLayout>
        <AppHeader />
        <Sidebar />
        <Content />
        {!isWeb && (
          <>
            <IpcListener />
            {/* 把"网络状态"与"更新进度"的副作用从 sidebar 抽到根级，
                统一通过 toast 反馈，让 sidebar 内不再保留状态组件 */}
            <GlobalDesktopToasts />
          </>
        )}
      </RootLayout>
    </RootProviders>
  )
}

/**
 * 仅 Electron 桌面端挂载的全局 toast 适配器组件。
 * 不渲染任何 DOM，只跑两个订阅 hook：
 *  - useNetworkToast：网络异常 → destructive toast，恢复 → 自动 dismiss
 *  - useUpdateToast：下载进度 / 安装就绪 → 持续 toast
 * Web 端两个 hook 内部都自带 isWeb 兜底；这里再用 !isWeb 包一层避免重复订阅。
 */
const GlobalDesktopToasts = () => {
  useNetworkToast()
  useUpdateToast()
  return null
}

const Content = () => (
  <main>
    <AnimatedOutlet />
  </main>
)
export default App
