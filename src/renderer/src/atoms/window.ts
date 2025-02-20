import { atom, useAtomValue } from 'jotai'

export enum WindowState {
  MINIMIZED = 'minimized',
  MAXIMIZED = 'maximized',
  NORMAL = 'normal',
}

export const windowStateAtom = atom<WindowState>(WindowState.NORMAL)

export const useWindowState = () => useAtomValue(windowStateAtom)
