import { scan } from 'react-scan'

import { isDev } from '../lib/env'
import { initializeDayjs } from './date'
import { initializeSentry } from './sentry'

export const initializeApp = () => {
  initializeDayjs()
  initializeSentry()

  if (isDev) {
    scan({
      enabled: false,
      log: true, // logs render info to console (default: false)
      showToolbar: false,
    })
  }
}
