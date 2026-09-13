import type { FC } from 'react'
import { Switch } from '@renderer/components/ui/switch'

interface SettingSwitchProps {
  onCheckedChange: (value: boolean) => void
  value: boolean
  playerMaterial?: boolean
  id?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
}

export const SettingSwitch: FC<SettingSwitchProps> = (props) => {
  const { onCheckedChange, value, playerMaterial, ...switchProps } = props
  return (
    <Switch
      onCheckedChange={onCheckedChange}
      checked={value}
      className={
        playerMaterial
          ? 'bg-white/18 focus-visible:ring-[var(--player-settings-focus)] focus-visible:ring-offset-0 data-[state=checked]:bg-[var(--player-settings-accent)] data-[state=unchecked]:bg-white/18'
          : undefined
      }
      thumbClassName={playerMaterial ? 'bg-white' : undefined}
      {...switchProps}
    />
  )
}
