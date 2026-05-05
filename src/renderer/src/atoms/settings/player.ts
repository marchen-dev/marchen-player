import type { SelectOption } from '@renderer/components/modules/shared/setting/SettingSelect'
import {
  danmakuDurationList,
  danmakuEndAreaList,
  danmakuFontSizeList,
} from '@renderer/components/modules/settings/views/player/list'
import { useAtom, useAtomValue } from 'jotai'

import { createSettingATom } from './helper'

const getSelectedDefaultValue = (list: SelectOption[]) => {
  return list.find((item) => item.default)?.value
}

const createPlayerDefaultSettings = () => {
  return {
    enableTraditionalToSimplified: false,
    enableAutomaticEpisodeSwitching: false,
    enableMiniProgress: true,
    danmakuFontSize: getSelectedDefaultValue(danmakuFontSizeList) ?? '26',
    danmakuDuration: getSelectedDefaultValue(danmakuDurationList) ?? '15000',
    danmakuEndArea: getSelectedDefaultValue(danmakuEndAreaList)!,
  }
}

const playerSettingAtom = createSettingATom('player', createPlayerDefaultSettings)

export { playerSettingAtom }
export const usePlayerSettings = () => useAtom(playerSettingAtom)
export const usePlayerSettingsValue = () => useAtomValue(playerSettingAtom)
