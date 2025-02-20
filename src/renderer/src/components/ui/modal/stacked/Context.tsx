import { atom } from 'jotai'
import type { FC, RefObject } from 'react'
import { createContext, use } from 'react'

import type { ModalProps } from './types'

export type currentModalContextProps = ModalContentPropsInternal & {
  ref: RefObject<HTMLElement | null>
}

export const modalIdToPropsMap = {} as Record<string, ModalProps>

export const CurrentModalContext = createContext<currentModalContextProps | null>(null)

export const useCurrentModal = () => {
  const context = use(CurrentModalContext)
  if (!context) {
    throw new Error('useCurrentModal must be used within a ModalStackProvider')
  }
  return context
}

export type ModalContentComponent<T> = FC<ModalContentPropsInternal & T>

export type ModalContentPropsInternal = {
  dismiss: () => void
}

export const modalStackAtom = atom([] as (ModalProps & { id: string })[])
