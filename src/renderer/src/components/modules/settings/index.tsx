import type { FC } from 'react'
import type { SettingTabsModel } from './tabs'
import { DividerVertical } from '@renderer/components/ui/divider'
import { ScrollArea } from '@renderer/components/ui/scrollArea'

import { cn } from '@renderer/lib/utils'
import { setCurrentSetting, useCurrentSetting } from './provider'
import { settingTabs } from './tabs'

export const SettingModal = () => {
  const { component } = useCurrentSetting()
  return (
    <div className="flex h-full">
      <div className="mt-3 w-[140px]">
        <ul className="space-y-2">
          {settingTabs.map((tab) => (
            <SettingTabItem key={tab.title} {...tab} />
          ))}
        </ul>
      </div>
      <DividerVertical className="mr-0 shrink-0 border-slate-200 opacity-80 dark:border-neutral-800" />
      <div className="bg-base-100 flex-1">
        <ScrollArea className="h-full">{component}</ScrollArea>
      </div>
    </div>
  )
}

export const SettingTabItem: FC<SettingTabsModel> = (props) => {
  const { icon, title } = props
  const { title: currentTitle } = useCurrentSetting()
  return (
    <li
      className={cn(
        'flex cursor-default items-center gap-1 px-3 py-1',
        title === currentTitle && 'bg-base-200 rounded-lg',
      )}
      onClick={() => setCurrentSetting(props)}
    >
      <i className={cn(icon, 'size-[1.2rem] align-middle')} />
      <span>{title}</span>
    </li>
  )
}

export const ModalTitle = () => {
  return (
    <h4 className="flex items-center gap-1">
      <i className="icon-[mingcute--settings-7-line] text-xl" />
      <span>设置</span>
    </h4>
  )
}
