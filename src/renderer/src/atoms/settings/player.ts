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

const atom = createSettingATom('player', createPlayerDefaultSettings)

export const usePlayerSettings = () => useAtom(atom)
export const usePlayerSettingsValue = () => useAtomValue(atom)
