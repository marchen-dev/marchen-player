import type { EnginePreference } from '@renderer/services/player-runtime/engine-policy'
import { playerEngineStateAtom } from '@renderer/atoms/player-engine'
import { usePlayerSettings } from '@renderer/atoms/settings/player'
import { getCompatSupport } from '@renderer/services/player-runtime/compat-support'
import { useAtomValue } from 'jotai'
import { SettingSelect } from './SettingSelect'

const options = [
  { value: 'auto', label: '自动' },
  { value: 'native', label: '原生（H5）' },
  { value: 'compat', label: '兼容内核' },
]

/**
 * 播放内核设置的数据与状态文案。应用设置（标准设置行）与播放器面板（毛玻璃纵向排版）
 * 外观不同，但选项、切换逻辑和状态文案只保留这一份。
 */
export const usePlayerEngineSetting = () => {
  const [settings, setSettings] = usePlayerSettings()
  const engine = useAtomValue(playerEngineStateAtom)
  const support = getCompatSupport()
  const selected = engine?.pending ?? engine?.preference ?? settings.enginePreference ?? 'auto'
  const change = (value: string) => {
    const preference = value as EnginePreference
    if (preference === 'compat' && !support.supported) return
    if (engine) void engine.selectPreference(preference)
    else setSettings((previous) => ({ ...previous, enginePreference: preference }))
  }
  const statusText = engine?.switching
    ? engine.pending
      ? '正在切换内核…'
      : '正在准备播放…'
    : engine?.actual
      ? `当前使用：${engine.actual === 'native' ? '原生（H5）' : '兼容内核'}`
      : '下次打开视频时应用；自动模式优先使用原生播放。'

  return {
    groups: options.map((option) => ({
      ...option,
      disabled: option.value === 'compat' && !support.supported,
    })),
    value: !support.supported && selected === 'compat' ? 'auto' : selected,
    change,
    statusText,
    unsupportedReason: support.supported ? undefined : support.reason,
    error: engine?.error,
  }
}

/** 应用设置中「播放内核」行的说明：状态文案 + 不支持原因 + 错误，与其他设置行的说明同样排在标题下方 */
export const PlayerEngineDescription = ({
  state,
}: {
  state: ReturnType<typeof usePlayerEngineSetting>
}) => (
  <>
    <span role="status">{state.statusText}</span>
    {state.unsupportedReason && <span className="block">{state.unsupportedReason}</span>}
    {state.error && <span className="block text-amber-500">{state.error}</span>}
  </>
)

/** 应用设置中「播放内核」行右侧的下拉框 */
export const PlayerEngineSelect = ({
  state,
  ariaLabel,
}: {
  state: ReturnType<typeof usePlayerEngineSetting>
  ariaLabel?: string
}) => (
  <SettingSelect
    ariaLabel={ariaLabel}
    groups={state.groups}
    value={state.value}
    onValueChange={state.change}
  />
)

/** 播放器设置面板中的纵向排版，沿用毛玻璃材质 */
export const PlayerEngineSetting = ({
  container,
  playerMaterial = false,
}: {
  container?: Element | DocumentFragment | null
  playerMaterial?: boolean
}) => {
  const state = usePlayerEngineSetting()
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm">播放内核</span>
        <SettingSelect
          groups={state.groups}
          value={state.value}
          onValueChange={state.change}
          container={container}
          playerMaterial={playerMaterial}
        />
      </div>
      <p className="text-xs opacity-70" role="status">
        {state.statusText}
      </p>
      {state.unsupportedReason && <p className="text-xs opacity-70">{state.unsupportedReason}</p>}
      {state.error && <p className="text-xs text-amber-500">{state.error}</p>}
    </div>
  )
}
