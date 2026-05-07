import type { AISettings } from '@renderer/request/models/ai'
import { useAtom, useAtomValue } from 'jotai'

import { createSettingATom } from './helper'

const createAIDefaultSettings = (): AISettings => ({
  providers: [],
  activeProviderId: null,
})

const aiSettingAtom = createSettingATom('ai', createAIDefaultSettings)

export { aiSettingAtom }
export const useAISettings = () => useAtom(aiSettingAtom)
export const useAISettingsValue = () => useAtomValue(aiSettingAtom)
