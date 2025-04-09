import { atom } from 'jotai'

export const updateProgressAtom = atom<{
  progress: number
  status: 'downloading' | 'installing'
} | null>(null)
