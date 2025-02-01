import type { ReactNode } from 'react'

import { AboutView } from './views/about/About'
import { GeneralView } from './views/general/General'
import { PlayerView } from './views/player'

export const settingTabs = [
  {
    title: '通用',
    icon: 'icon-[mingcute--settings-3-line]',
    component: <GeneralView />,
  },
  {
    title: '播放器',
    icon: 'icon-[mingcute--play-circle-line]',
    component: <PlayerView />,
  },
  {
    title: '关于',
    icon: 'icon-[mingcute--information-line]',
    component: <AboutView />,
  },
]

export interface SettingTabsModel {
  title: string
  icon: string
  component: ReactNode
}
