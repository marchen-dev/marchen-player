import type { FC, PropsWithChildren } from 'react'
import type { ModalProps } from './types'
import { jotaiStore } from '@renderer/atoms/store'
import { AnimatePresence } from 'framer-motion'
import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useId, useRef } from 'react'

import { useLocation } from 'react-router'
import { MODAL_STACK_Z_INDEX } from './constants'
import { modalIdToPropsMap, modalStackAtom } from './Context'
import { ModalInternal } from './Modal'
import { ModalOverlay } from './Overlay'

const useDismissAllWhenRouterChange = () => {
  const { pathname } = useLocation()
  useEffect(() => {
    actions.dismissAll()
  }, [pathname])
}

export const ModalStackProvider: FC<PropsWithChildren> = ({ children }) => (
  <>
    <ModalStack />
    {children}
  </>
)

interface ModalStackOptions {
  wrapper?: FC
}
export const useModalStack = (options?: ModalStackOptions) => {
  const id = useId()
  const currentCount = useRef(0)
  const { wrapper } = options || {}
  return {
    present: useCallback(
      (props: ModalProps & { id?: string }) => {
        const fallbackModelId = `${id}-${++currentCount.current}`
        const modalId = props.id ?? fallbackModelId

        const currentStack = jotaiStore.get(modalStackAtom)

        const existingModal = currentStack.find((item) => item.id === modalId)
        if (existingModal) {
          // Move to top
          jotaiStore.set(modalStackAtom, (p) => {
            const index = p.indexOf(existingModal)
            return [...p.slice(0, index), ...p.slice(index + 1), existingModal]
          })
        } else {
          jotaiStore.set(modalStackAtom, (p) => {
            const modalProps = {
              ...props,
              id: modalId,
              wrapper,
            }
            modalIdToPropsMap[modalProps.id] = modalProps
            return p.concat(modalProps)
          })
        }

        return () => {
          jotaiStore.set(modalStackAtom, (p) => p.filter((item) => item.id !== modalId))
        }
      },
      [id],
    ),
    id,

    ...actions,
  }
}

const actions = {
  dismiss(id: string) {
    jotaiStore.set(modalStackAtom, (p) => p.filter((item) => item.id !== id))
  },
  dismissTop() {
    jotaiStore.set(modalStackAtom, (p) => p.slice(0, -1))
  },
  dismissAll() {
    jotaiStore.set(modalStackAtom, [])
  },
}

const ModalStack = () => {
  const stack = useAtomValue(modalStackAtom)

  // Vite HMR issue
  useDismissAllWhenRouterChange()

  const forceOverlay = stack.some((item) => item.overlay)

  return (
    <AnimatePresence mode="popLayout">
      {stack.map((item, index) => (
        <ModalInternal key={item.id} item={item} index={index} isTop={index === stack.length - 1} />
      ))}
      {stack.length > 0 && forceOverlay && (
        <ModalOverlay zIndex={MODAL_STACK_Z_INDEX + stack.length - 1} />
      )}
    </AnimatePresence>
  )
}
