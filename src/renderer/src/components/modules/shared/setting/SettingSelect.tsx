import type { FC } from 'react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'

export interface SelectOption {
  label: string
  value: string
  default?: boolean
}

interface SettingSelectProps {
  placeholder?: string
  groups: SelectOption[]
  value: string
  onValueChange: (value: string) => void
  container?: Element | DocumentFragment | null
  playerMaterial?: boolean
}

export const SettingSelect: FC<SettingSelectProps> = (props) => {
  const { placeholder, groups, value, onValueChange, container, playerMaterial } = props

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={cn(
          'h-9 w-[150px]',
          playerMaterial &&
            'border-white/11 bg-white/8 text-white focus:ring-[var(--player-settings-focus)] focus:ring-offset-0',
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        container={container}
        className={cn(playerMaterial && 'border-white/11 bg-[rgb(38_38_44/96%)] text-white')}
      >
        <SelectGroup>
          {groups.map((group) => (
            <SelectItem
              key={group.label}
              value={group.value}
              className={cn(playerMaterial && 'focus:bg-white/14 focus:text-white')}
            >
              {group.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
