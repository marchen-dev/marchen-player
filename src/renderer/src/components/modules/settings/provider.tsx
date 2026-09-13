import type { AppSettingsSection } from '@marchen/shared/types/renderer-handlers'
import { DEFAULT_APP_SETTINGS_SECTION } from '@marchen/shared/types/renderer-handlers'
import { jotaiStore } from '@renderer/atoms/store'

import { atom, useAtomValue } from 'jotai'

export const currentSettingSectionAtom = atom<AppSettingsSection>(DEFAULT_APP_SETTINGS_SECTION)

export const useCurrentSetting = () => useAtomValue(currentSettingSectionAtom)

export const setCurrentSetting = (section: AppSettingsSection = DEFAULT_APP_SETTINGS_SECTION) => {
  jotaiStore.set(currentSettingSectionAtom, section)
}
