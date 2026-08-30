import { appGroup } from './app'
import { mediaGroup } from './media'
import { playerGroup } from './player'
import { settingGroup } from './setting'
import { utilsGroup } from './utils'

export const router = {
  app: appGroup,
  media: mediaGroup,
  player: playerGroup,
  setting: settingGroup,
  utils: utilsGroup,
}

export type Router = typeof router
