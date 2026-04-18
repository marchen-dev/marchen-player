// import { DEVICE_ID } from '@main/constants/system'
import { isDev } from '@main/lib/env'
// import * as Sentry from '@sentry/electron'
// import { app } from 'electron'

export const registerSentry = () => {
  if (isDev) {
    // noop in dev
  }
  // Sentry.init({
  //   dsn: import.meta.env.VITE_SENTRY_DSN,
  //   integrations: [Sentry.captureConsoleIntegration()],
  // })

  // Sentry.setTag('device_id', DEVICE_ID)
  // Sentry.setTag('app_version', app.getVersion())
  // Sentry.setTag('build', 'electron')
}
