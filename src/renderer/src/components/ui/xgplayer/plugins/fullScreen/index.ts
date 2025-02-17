import './index.css'

import { handlers, tipcClient } from '@renderer/lib/client'
import { Plugin } from '@suemor/xgplayer'

export default class fullEntireScreen extends Plugin {
  static readonly pluginName = 'fullEntireScreen'
  static readonly pluginClassName = {
    icon: `xgplayer-plugin-${fullEntireScreen.pluginName}-icon`,
  }

  icon: HTMLElement | undefined
  private toggleButtonClickListener: () => void

  constructor(args) {
    super(args)

    this.icon = this.find(`.${fullEntireScreen.pluginClassName.icon}`) as HTMLDivElement

    this.toggleButtonClickListener = this.toggleButtonClickFunction.bind(this)
  }

  static get defaultConfig() {
    return {
      position: this.POSITIONS.CONTROLS_RIGHT,
      isFullscreen: false,
    }
  }

  afterCreate() {
    this.icon?.addEventListener('click', this.toggleButtonClickListener)

    this.updateFullScreenState()

    handlers?.windowAction.listen((action) => {
      if (action === 'enter-full-screen' || action === 'leave-full-screen') {
        this.updateFullScreenState()
      }
    })
  }

  private toggleButtonClickFunction() {
    if (this.config.isFullscreen) {
      tipcClient?.windowAction({ action: 'leave-full-screen' })
    } else {
      tipcClient?.windowAction({ action: 'enter-full-screen' })
    }
    this.updateFullScreenState()
  }

  private async updateFullScreenState() {
    const isFullScreen = await tipcClient?.getWindowIsFullScreen()
    if (isFullScreen && !this.player?.cssfullscreen) {
      this.player.getCssFullscreen()
    }
    this.config.isFullscreen = isFullScreen ?? false
    this.updateIcon()
  }

  private updateIcon() {
    if (this.icon) {
      if (this.config.isFullscreen) {
        this.icon.classList.remove('xgplayer-fullscreen')
        this.icon.classList.add('xgplayer-exit-fullscreen')
      } else {
        this.icon.classList.remove('xgplayer-exit-fullscreen')
        this.icon.classList.add('xgplayer-fullscreen')
      }
    }
  }

  destroy(): void {
    this.icon?.removeEventListener('click', this.toggleButtonClickListener)
    this.icon = undefined
  }

  render(): string {
    return `<div>
    <i class="${fullEntireScreen.pluginClassName.icon} ${this.config.isFullscreen ? 'xgplayer-exit-fullscreen' : 'xgplayer-fullscreen'}"/>
    </div>`
  }
}
