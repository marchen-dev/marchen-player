import type { EnginePreference } from '@renderer/services/player-runtime/engine-policy'
import { playerEngineStateAtom } from '@renderer/atoms/player-engine'
import { usePlayerSettings } from '@renderer/atoms/settings/player'
import { getCanvasSupport } from '@renderer/services/player-runtime/canvas-support'
import { useAtomValue } from 'jotai'
import { SettingSelect } from './SettingSelect'

const options = [
  { value: 'auto', label: '自动' },
  { value: 'native', label: '原生（H5）' },
  { value: 'canvas', label: '兼容（Canvas）' },
]

export const PlayerEngineSetting = ({
  container,
  playerMaterial = false,
}: {
  container?: Element | DocumentFragment | null
  playerMaterial?: boolean
}) => {
  const [settings, setSettings] = usePlayerSettings()
  const engine = useAtomValue(playerEngineStateAtom)
  const support = getCanvasSupport()
  const selected = engine?.pending ?? engine?.preference ?? settings.enginePreference ?? 'auto'
  const change = (value: string) => {
    const preference = value as EnginePreference
    if (preference === 'canvas' && !support.supported) return
    if (engine) void engine.selectPreference(preference)
    else setSettings((previous) => ({ ...previous, enginePreference: preference }))
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm">播放内核</span>
        <SettingSelect
          groups={options.map((option) => ({
            ...option,
            disabled: option.value === 'canvas' && !support.supported,
          }))}
          value={!support.supported && selected === 'canvas' ? 'auto' : selected}
          onValueChange={change}
          container={container}
          playerMaterial={playerMaterial}
        />
      </div>
      <p className="text-xs opacity-70" role="status">
        {engine?.switching
          ? engine.pending
            ? '正在切换内核…'
            : '正在准备播放…'
          : engine?.actual
            ? `当前使用：${engine.actual === 'native' ? '原生（H5）' : '兼容（Canvas）'}`
            : '下次打开视频时应用；自动模式优先使用原生播放。'}
      </p>
      {!support.supported && <p className="text-xs opacity-70">{support.reason}</p>}
      {engine?.error && <p className="text-xs text-amber-500">{engine.error}</p>}
    </div>
  )
}
