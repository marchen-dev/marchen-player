export const NON_CRITICAL_FEATURE_FLAGS = {
  'compact-library-cards': false,
  'player-control-hints': true,
  'settings-ai-badge': false,
} as const

export type NonCriticalFeatureFlag = keyof typeof NON_CRITICAL_FEATURE_FLAGS
type FlagValue = boolean | string
type FlagReader = (flag: NonCriticalFeatureFlag) => FlagValue | undefined

let reader: FlagReader | undefined

export const configureFeatureFlagReader = (next?: FlagReader): void => {
  reader = next
}

export const getFeatureFlag = <F extends NonCriticalFeatureFlag>(
  flag: F,
): FlagValue | (typeof NON_CRITICAL_FEATURE_FLAGS)[F] => {
  try {
    return reader?.(flag) ?? NON_CRITICAL_FEATURE_FLAGS[flag]
  } catch {
    return NON_CRITICAL_FEATURE_FLAGS[flag]
  }
}
