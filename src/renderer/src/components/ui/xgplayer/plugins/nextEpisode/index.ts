import { Events, Plugin } from '@suemor/xgplayer'

import './index.css'

export default class NextEpisode extends Plugin {
  static readonly pluginName = 'nextEpisode'
  static readonly pluginClassName = {
    icon: `xgplayer-plugin-${NextEpisode.pluginName}-icon`,
  }

  icon: HTMLElement | undefined
  private toggleButtonClickListener: () => void

  constructor(args) {
    super(args)
    this.icon = this.find(`.${NextEpisode.pluginClassName.icon}`) as HTMLDivElement
    this.toggleButtonClickListener = this.toggleButtonClickFunction.bind(this)
  }

  static get defaultConfig() {
    return {
      position: this.POSITIONS.CONTROLS_LEFT,
      index: 1,
      urlList: [],
    }
  }

  afterCreate() {
    if (this.isLastEpisode()) {
      return
    }
    this.icon?.addEventListener('click', this.toggleButtonClickListener)
  }

  toggleButtonClickFunction() {
    if (this.isLastEpisode()) {
      return
    }
    const urlList = this.config.urlList as string[]
    const nextAnimeUrl = urlList?.indexOf(this.player.config.url as string)
    this.player.emit(Events.PLAYNEXT, urlList[nextAnimeUrl + 1] ?? urlList[0])
  }

  private isLastEpisode() {
    const urlList = this.config.urlList as string[]
    return urlList?.indexOf(this.player.config.url as string) === urlList.length - 1
  }

  destroy(): void {
    this.icon?.removeEventListener('click', this.toggleButtonClickListener)
    this.icon = undefined
  }

  render() {
    if (this.isLastEpisode()) {
      return ''
    }
    return `<div>
    <i class="${NextEpisode.pluginClassName.icon} xgplayer-nextEpisode"/>
    </div>`
  }
}
