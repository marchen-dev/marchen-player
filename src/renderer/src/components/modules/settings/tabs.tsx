import type { AppSettingsSection } from '@marchen/shared/types/renderer-handlers'
import type { ComponentType } from 'react'

import { isWeb } from '@renderer/lib/utils'
import { DownloadSettingsView } from '@renderer/page/downloads/settings'

import { AboutView } from './views/about/About'
import { GeneralView } from './views/general/General'
import { LabsView } from './views/labs/Labs'

export interface SettingTabModel {
  id: AppSettingsSection
  label: string
  description: string
  icon: string
  component: ComponentType
}

export const settingTabs: SettingTabModel[] = [
  {
    id: 'general',
    label: '通用',
    description: '管理应用行为、外观与本地数据',
    icon: 'icon-[mingcute--settings-3-line]',
    component: GeneralView,
  },
  ...(!isWeb
    ? [
        {
          id: 'downloads' as const,
          label: '下载',
          description: '管理下载目录与传输设置',
          icon: 'icon-[mingcute--download-2-line]',
          component: DownloadSettingsView,
        },
      ]
    : []),
  {
    id: 'labs',
    label: '实验室',
    description: '抢先体验仍在开发中的功能',
    icon: 'icon-[mingcute--flask-line]',
    component: LabsView,
  },
  {
    id: 'about',
    label: '关于',
    description: '查看版本、更新与反馈渠道',
    icon: 'icon-[mingcute--information-line]',
    component: AboutView,
  },
]

export const getSettingTab = (section: AppSettingsSection) =>
  settingTabs.find((tab) => tab.id === section) ?? settingTabs[0]
