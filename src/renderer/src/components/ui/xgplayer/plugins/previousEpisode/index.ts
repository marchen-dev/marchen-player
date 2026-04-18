import { Events, Plugin } from '@suemor/xgplayer'

import './index.css'

export default class PreviousEpisode extends Plugin {
  static readonly pluginName = 'previousEpisode'
  static readonly pluginClassName = {
    icon: `xgplayer-plugin-${PreviousEpisode.pluginName}-icon`,
  }

  icon: HTMLElement | undefined
  private toggleButtonClickListener: () => void

  constructor(args) {
    super(args)
    this.icon = this.find(`.${PreviousEpisode.pluginClassName.icon}`) as HTMLDivElement
    this.toggleButtonClickListener = this.toggleButtonClickFunction.bind(this)
  }

  static get defaultConfig() {
    return {
      position: this.POSITIONS.CONTROLS_LEFT,
      index: -1,
      urlList: [],
    }
  }

  afterCreate() {
    if (this.isFirstEpisode()) {
      return
    }
    this.icon?.addEventListener('click', this.toggleButtonClickListener)
  }

  private toggleButtonClickFunction() {
    const urlList = this.config.urlList as string[]
    const nextAnimeUrl = urlList.indexOf(this.player.config.url as string)
    this.player.emit(Events.PLAYNEXT, urlList[nextAnimeUrl - 1] ?? urlList[0])
  }

  private isFirstEpisode() {
    const urlList = this.config.urlList as string[]
    return urlList?.indexOf(this.player.config.url as string) <= 0
  }

  destroy(): void {
    this.icon?.removeEventListener('click', this.toggleButtonClickListener)
    this.icon = undefined
  }

  render() {
    if (this.isFirstEpisode()) {
      return ''
    }
    return `<div>
    <i class="${PreviousEpisode.pluginClassName.icon} xgplayer-previousEpisode"/>
    </div>`
  }
}
