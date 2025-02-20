import type SubtitlesOctopus from 'libass-wasm'
import type { FC, PropsWithChildren } from 'react'
import { createContext, use, useMemo, useState } from 'react'

import type { PlayerType } from './initialize/hooks'

interface PlayerContextProps {
  subtitlesInstance: [
    SubtitlesOctopus | null,
    React.Dispatch<React.SetStateAction<SubtitlesOctopus | null>>,
  ]
  playerInstance?: PlayerType | null
}

const PlayerContext = createContext<PlayerContextProps | null>(null)

export const PlayerProvider: FC<PropsWithChildren<{ value: PlayerType | null }>> = ({
  value,
  children,
}) => {
  const subtitlesInstance = useState<SubtitlesOctopus | null>(null)

  const contextValue = useMemo(() => {
    return { playerInstance: value, subtitlesInstance }
  }, [value, subtitlesInstance])

  return <PlayerContext value={contextValue}>{children}</PlayerContext>
}

export const usePlayerInstance = () => {
  const context = use(PlayerContext)
  if (!context) {
    throw new Error('usePlayerInstance must be used within a PlayerProvider')
  }
  return context.playerInstance
}

export const useSubtitleInstance = () => {
  const context = use(PlayerContext)
  if (!context) {
    throw new Error('useSubtitleInstance must be used within a PlayerProvider')
  }
  return context.subtitlesInstance
}
