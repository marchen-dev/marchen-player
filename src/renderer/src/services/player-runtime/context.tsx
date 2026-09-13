import type { PlaybackClock, PlaybackState } from '@marchen/playback-core'
import type { PropsWithChildren } from 'react'
import type { PlayerRuntime, PlayerRuntimeCommands } from './runtime'
import { createContext, use, useSyncExternalStore } from 'react'

const PlayerRuntimeContext = createContext<PlayerRuntime | null>(null)

export const PlayerRuntimeProvider = ({
  runtime,
  children,
}: PropsWithChildren<{ runtime: PlayerRuntime }>) => (
  <PlayerRuntimeContext value={runtime}>{children}</PlayerRuntimeContext>
)

export const usePlayerRuntime = (): PlayerRuntime => {
  const runtime = use(PlayerRuntimeContext)
  if (!runtime) throw new Error('usePlayerRuntime 必须在 PlayerRuntimeProvider 中使用')
  return runtime
}

export const usePlaybackViewModel = (): PlaybackState => {
  const runtime = usePlayerRuntime()
  return useSyncExternalStore(
    (listener) => runtime.subscribe(listener),
    () => runtime.state,
    () => runtime.state,
  )
}

export const usePlaybackCommands = (): PlayerRuntimeCommands => usePlayerRuntime().commands

export const usePlaybackClock = (): PlaybackClock => usePlayerRuntime().clock
