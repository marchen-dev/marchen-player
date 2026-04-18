import type { FC, PropsWithChildren } from 'react'
import type { SettingTabsModel } from './tabs'
import { jotaiStore } from '@renderer/atoms/store'
import { useBeforeMounted } from '@renderer/hooks/use-before-mounted'

import { atom, useAtomValue } from 'jotai'
import { settingTabs } from './tabs'

const currentSettingAtom = atom<SettingTabsModel | null>(settingTabs[0])

export const SettingProvider: FC<PropsWithChildren & { data: SettingTabsModel }> = (props) => {
  const { children, data } = props
  useBeforeMounted(() => {
    jotaiStore.set(currentSettingAtom, data)
  })

  return children
}

export const useCurrentSetting = () => {
  const currentSetting = useAtomValue(currentSettingAtom)
  if (currentSetting === null) {
    throw new Error('current setting is null')
  }
  return currentSetting
}

export const setCurrentSetting = (data: SettingTabsModel = settingTabs[0]) => {
  jotaiStore.set(currentSettingAtom, data)
}
