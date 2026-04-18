import type { FC } from 'react'
import { Switch } from '@renderer/components/ui/switch'

interface SettingSwitchProps {
  onCheckedChange: (value: boolean) => void
  value: boolean
}

export const SettingSwitch: FC<SettingSwitchProps> = (props) => {
  const { onCheckedChange, value } = props
  return <Switch onCheckedChange={onCheckedChange} checked={value} />
}
