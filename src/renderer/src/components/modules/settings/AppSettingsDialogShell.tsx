import type { FC, PropsWithChildren } from 'react'
import { m, useReducedMotion } from 'framer-motion'

/** 应用设置独占的非拖拽外壳，不影响 ModalStack 中的普通确认框。 */
export const AppSettingsDialogShell: FC<PropsWithChildren> = ({ children }) => {
  const reduceMotion = useReducedMotion()

  return (
    <div data-app-settings className="app-settings-layer no-drag-region">
      <m.div
        aria-hidden="true"
        className="app-settings-scrim"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduceMotion ? undefined : { opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.18 }}
      />
      <m.div
        className="app-settings-shell"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.985, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0, scale: 0.99, y: 3 }}
        transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {children}
      </m.div>
    </div>
  )
}
