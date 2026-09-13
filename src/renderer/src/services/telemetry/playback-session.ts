import { nanoid } from 'nanoid'

let updateContext: (sessionId: string | undefined) => void = () => {}
let activeSessionId: string | undefined

export const configurePlaybackSessionContext = (
  setter?: (sessionId: string | undefined) => void,
) => {
  updateContext = setter ?? (() => {})
}

export const beginPlaybackTelemetrySession = () => {
  const sessionId = nanoid()
  activeSessionId = sessionId
  updateContext(sessionId)
  return sessionId
}

export const endPlaybackTelemetrySession = (sessionId: string) => {
  if (activeSessionId !== sessionId) return
  activeSessionId = undefined
  updateContext(undefined)
}
