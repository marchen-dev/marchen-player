import { appGroup } from './app'
import { playerGroup } from './player'
import { settingGroup } from './setting'

export const router = {
  app: appGroup,
  player: playerGroup,
  setting: settingGroup,
}

export type Router = typeof router
