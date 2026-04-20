import type { JSX } from 'react'

import { RootLayout } from './components/layout/root/RootLayout'
import { Sidebar } from './components/layout/sidebar'
import { Prepare } from './components/modules/app/Prepare'
import AnimatedOutlet from './components/ui/animate/AnimatedOutlet'
import { isWeb } from './lib/utils'
import { RootProviders } from './providers'
import { IpcListener } from './providers/IpcListener'

function App(): JSX.Element {
  return (
    <RootProviders>
      <Prepare />

      <RootLayout>
        <Sidebar />
        <Content />
        {!isWeb && <IpcListener />}
      </RootLayout>
    </RootProviders>
  )
}

const Content = () => (
  <main className="flex-1">
    <AnimatedOutlet />
  </main>
)
export default App
