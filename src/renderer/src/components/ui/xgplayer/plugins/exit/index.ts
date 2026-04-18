import { Plugin } from '@suemor/xgplayer'

import './index.css'

export default class Exit extends Plugin {
  static readonly pluginName = 'exit'
  static readonly pluginClassName = {
    icon: `xgplayer-plugin-${Exit.pluginName}-icon`,
  }

  icon: HTMLElement | undefined
  private toggleButtonClickListener: () => void

  constructor(args) {
    super(args)

    this.icon = this.find(`.${Exit.pluginClassName.icon}`) as HTMLDivElement

    this.toggleButtonClickListener = this.toggleButtonClickFunction.bind(this)
  }

  static get defaultConfig() {
    return {
      position: this.POSITIONS.ROOT_TOP,
    }
  }

  afterCreate() {
    this.icon?.addEventListener('click', this.toggleButtonClickListener)
  }

  private toggleButtonClickFunction() {
    this.player.emit('exit')
  }

  destroy(): void {
    this.icon?.removeEventListener('click', this.toggleButtonClickListener)
    this.icon = undefined
  }

  render(): string {
    return `<div>
    <div class="${Exit.pluginClassName.icon}  xgplayer-exit-wrapper">
    <span class=" xgplayer-exit"></span>
    <span>关闭</span>
    </div>
    </div>`
  }
}
