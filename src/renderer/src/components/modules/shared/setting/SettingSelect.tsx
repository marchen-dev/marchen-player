import type { FC } from 'react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select'

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
}

export const SettingSelect: FC<SettingSelectProps> = (props) => {
  const { placeholder, groups, value, onValueChange } = props

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-9 w-[150px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {groups.map((group) => (
            <SelectItem key={group.label} value={group.value}>
              {group.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
