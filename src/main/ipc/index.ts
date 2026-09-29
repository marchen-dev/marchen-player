import { appGroup } from './app'
import { danmakuGroup } from './danmaku'
import { downloadsGroup } from './downloads'
import { playerGroup } from './player'
import { settingGroup } from './setting'

export const router = {
  downloads: downloadsGroup,
  danmaku: danmakuGroup,
  app: appGroup,
  player: playerGroup,
  setting: settingGroup,
}

export type Router = typeof router
