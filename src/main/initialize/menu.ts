import type { Translate } from '@marchen/i18n'
import type { MenuItem, MenuItemConstructorOptions } from 'electron'
import { Menu } from 'electron'
import { isMacOS } from '../lib/env'

import { onMainLanguageChanged, t } from '../lib/i18n'
import { checkForDesktopUpdates } from '../lib/update'
import { clearData, createSettingWindow, importAnime, openFeedback } from '../windows/setting'

/** 产品名不翻译，以变量形式嵌进各语言的菜单文案 */
const APP_NAME = 'Marchen'

/**
 * macOS 应用菜单的模板。
 *
 * 带系统角色的项（服务、隐藏、退出、关闭）仍然显式给出标题：系统只按系统语言显示，
 * 用户手动选了另一种界面语言时会和其他菜单项混杂。
 * 编辑、视图、窗口三组整体交给系统，没有自定义文案，跟随系统语言。
 */
export const createAppMenuTemplate = (
  translate: Translate,
): Array<MenuItemConstructorOptions | MenuItem> => [
  {
    label: APP_NAME,
    submenu: [
      {
        type: 'normal',
        label: translate('main:menu.about', { appName: APP_NAME }),
        click: () => createSettingWindow('about'),
      },
      {
        label: translate('main:menu.checkForUpdates'),
        click: () => {
          void checkForDesktopUpdates()
        },
      },
      {
        label: translate('main:menu.feedback'),
        click: openFeedback,
      },
      { type: 'separator' },
      {
        label: translate('main:menu.settings'),
        accelerator: 'CmdOrCtrl+,',
        click: () => createSettingWindow(),
      },
      { role: 'services', label: translate('main:menu.services') },
      { type: 'separator' },
      { role: 'hide', label: translate('main:menu.hide', { appName: APP_NAME }) },
      { role: 'hideOthers', label: translate('main:menu.hideOthers') },
      { type: 'separator' },
      {
        label: translate('main:menu.clearData'),
        click: clearData,
      },
      { role: 'quit', label: translate('main:menu.quit', { appName: APP_NAME }) },
    ],
  },
  {
    role: 'fileMenu',
    submenu: [
      {
        type: 'normal',
        label: translate('main:menu.importAnime'),
        click: importAnime,
      },
      { type: 'separator' },
      { role: 'close', label: translate('main:menu.close') },
    ],
  },
  {
    role: 'editMenu',
  },
  {
    role: 'viewMenu',
  },
  {
    role: 'windowMenu',
  },
]

/** 整体替换应用菜单；菜单项很少，语言变化时重建一次即可，不做增量更新 */
const buildAppMenu = () => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(createAppMenuTemplate(t)))
}

export const registerAppMenu = () => {
  if (!isMacOS) {
    return
  }
  buildAppMenu()
  // 用户切换界面语言（页面上报）或重置应用后，菜单随即更新
  onMainLanguageChanged(buildAppMenu)
}
