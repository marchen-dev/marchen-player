import * as Sentry from '@sentry/react'

import { ClickToComponent } from 'click-to-react-component'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { initializeApp } from './initialize'

import { reactRouter } from './router'
import './styles/main.css'

initializeApp()

const root = ReactDOM.createRoot(document.querySelector('#root') as HTMLElement, {
  // Callback called when an error is thrown and not caught by an Error Boundary.
  onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
    console.warn('Uncaught error', error, errorInfo.componentStack)
  }),
  // Callback called when React catches an error in an Error Boundary.
  onCaughtError: Sentry.reactErrorHandler(),
  // Callback called when React automatically recovers from errors.
  onRecoverableError: Sentry.reactErrorHandler(),
})

root.render(
  <>
    <RouterProvider router={reactRouter} />
    <ClickToComponent />
  </>,
)
