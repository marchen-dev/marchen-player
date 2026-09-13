import { atom, useAtomValue } from 'jotai'

export enum WindowState {
  MINIMIZED = 'minimized',
  MAXIMIZED = 'maximized',
  NORMAL = 'normal',
}

export const windowStateAtom = atom<WindowState>(WindowState.NORMAL)
export const windowFullscreenAtom = atom(false)

export const useWindowState = () => useAtomValue(windowStateAtom)
export const useWindowFullscreen = () => useAtomValue(windowFullscreenAtom)
