import { atom } from 'jotai'

export const desktopUpdateAtom = atom<
  import('@marchen/shared/types/update').DesktopUpdateState | null
>(null)
