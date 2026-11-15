import type { AppSettingsSection } from '@marchen/shared/types/renderer-handlers'
import type { ComponentType } from 'react'

import { isWeb } from '@renderer/lib/utils'
import { DownloadSettingsView } from '@renderer/page/downloads/settings'

import { AboutView } from './views/about/About'
import { GeneralView } from './views/general/General'
import { LabsView } from './views/labs/Labs'

/**
 * 设置分类。名称与说明不放在这里：这是模块顶层的常量，存了文字就不会随语言切换更新，
 * 渲染时按 id 取 settings 命名空间下的 `tabs.<id>.label` / `tabs.<id>.description`。
 */
export interface SettingTabModel {
  id: AppSettingsSection
  icon: string
  component: ComponentType
}

export const settingTabs: SettingTabModel[] = [
  {
    id: 'general',
    icon: 'icon-[mingcute--settings-3-line]',
    component: GeneralView,
  },
  ...(!isWeb
    ? [
        {
          id: 'downloads' as const,
          icon: 'icon-[mingcute--download-2-line]',
          component: DownloadSettingsView,
        },
      ]
    : []),
  {
    id: 'labs',
    icon: 'icon-[mingcute--flask-line]',
    component: LabsView,
  },
  {
    id: 'about',
    icon: 'icon-[mingcute--information-line]',
    component: AboutView,
  },
]

export const getSettingTab = (section: AppSettingsSection) =>
  settingTabs.find((tab) => tab.id === section) ?? settingTabs[0]
