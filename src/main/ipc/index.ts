import { appGroup } from './app'
import { danmakuGroup } from './danmaku'
import { playerGroup } from './player'
import { settingGroup } from './setting'

export const router = {
  danmaku: danmakuGroup,
  app: appGroup,
  player: playerGroup,
  setting: settingGroup,
}

export type Router = typeof router
