import { ClickToComponent } from 'click-to-react-component'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'

import { initializeApp } from './initialize'
import { reactRouter } from './router'
import { createReactRootErrorHandlers } from './services/telemetry/react-errors'
import { installStableRouterTracing } from './services/telemetry/sentry/router-tracing'
import './styles/main.css'

initializeApp()
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
