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
  disabled?: boolean
}

interface SettingSelectProps {
  ariaLabel?: string
  placeholder?: string
  groups: SelectOption[]
  value: string
  onValueChange: (value: string) => void
  container?: Element | DocumentFragment | null
  playerMaterial?: boolean
  disabled?: boolean
}

export const SettingSelect: FC<SettingSelectProps> = (props) => {
  const {
    placeholder,
    groups,
    value,
    onValueChange,
    container,
    playerMaterial,
    ariaLabel,
    disabled,
  } = props

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          // 最小宽度保持原来的 150px，更长的选项（英文等）撑开而不是被截断；
          // 上限防止在播放器侧栏这类窄容器里挤掉左边的标题
          // shrink-0：左边的标题较长时让标题换行，下拉框保持完整
          'h-9 w-auto max-w-[260px] min-w-[150px] shrink-0 gap-2',
          playerMaterial &&
            'border-white/11 bg-white/8 text-white focus:ring-[var(--player-settings-focus)] focus:ring-offset-0',
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        container={container}
        className={cn(playerMaterial && 'border-white/11 bg-player-popover player-glass text-white')}
      >
        <SelectGroup>
          {groups.map((group) => (
            <SelectItem
              key={group.label}
              value={group.value}
              disabled={group.disabled}
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
