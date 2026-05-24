import type { ReactNode } from 'react'
import { atom } from 'jotai'

export type PageHeaderVariant = 'default' | 'manage'

export interface PageHeaderState {
  title: ReactNode | null
  actions: ReactNode | null
  variant?: PageHeaderVariant
}

export const pageHeaderAtom = atom<PageHeaderState>({
  title: null,
  actions: null,
  variant: 'default',
})
