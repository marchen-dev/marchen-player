import type { AppSettingsSection } from '@marchen/shared/types/renderer-handlers'
import type { ComponentType } from 'react'

import { AboutView } from './views/about/About'
import { AIView } from './views/ai/AIView'
import { GeneralView } from './views/general/General'
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
  {
    id: 'ai',
    label: 'AI 服务',
    description: '配置用于智能功能的模型服务商',
    icon: 'icon-[mingcute--sparkles-2-line]',
    component: AIView,
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
