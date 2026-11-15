import { ClickToComponent } from 'click-to-react-component'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'

import { initializeApp } from './initialize'
import { initializeI18n } from './initialize/i18n'
import { reactRouter } from './router'
import { writeRendererSnapshot } from './services/telemetry/diagnostic-snapshot'
import { createReactRootErrorHandlers } from './services/telemetry/react-errors'
import { installStableRouterTracing } from './services/telemetry/sentry/router-tracing'
import './styles/main.css'

/** 挂载前确定界面语言，首屏直接用正确的语言渲染 */
export const prepareLanguage = initializeI18n

export const mountRenderer = () => {
  initializeApp()
  writeRendererSnapshot()
  installStableRouterTracing(reactRouter)

  const root = ReactDOM.createRoot(
    document.querySelector('#root') as HTMLElement,
    createReactRootErrorHandlers(),
  )

  root.render(
    <>
      <RouterProvider router={reactRouter} />
      <ClickToComponent />
    </>,
  )
}
