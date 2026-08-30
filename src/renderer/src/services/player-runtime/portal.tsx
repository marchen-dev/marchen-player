import type { PropsWithChildren } from 'react'
import { createContext, use, useState } from 'react'

const PlayerPortalContext = createContext<HTMLElement | null>(null)

/** 在 PlayerRoot 内提供 Radix Portal 容器，保证 Web DOM 全屏时浮层仍可见。 */
export const PlayerPortalRoot = ({ children }: PropsWithChildren) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)

  return (
    <PlayerPortalContext value={container}>
      {children}
      <div
        ref={setContainer}
        data-player-portal-root
        className="pointer-events-none absolute inset-0 z-50"
      />
    </PlayerPortalContext>
  )
}

export const usePlayerPortalContainer = (): HTMLElement | null => use(PlayerPortalContext)
