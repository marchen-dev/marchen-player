import { app } from 'electron'

/** 桌面安装形态；用于区分应用内自动更新与包管理器更新人群 */
export type DesktopPackageType = 'mac-app' | 'nsis' | 'appimage' | 'deb' | 'unpackaged' | 'unknown'

export const resolvePackageType = (
  options: { isPackaged: boolean; platform: NodeJS.Platform; appImage?: string } = {
    isPackaged: app.isPackaged,
    platform: process.platform,
    appImage: process.env.APPIMAGE,
  },
): DesktopPackageType => {
  if (!options.isPackaged) return 'unpackaged'
  switch (options.platform) {
    case 'darwin': {
      return 'mac-app'
    }
    case 'win32': {
      return 'nsis'
    }
    case 'linux': {
      // AppImage 运行时注入 APPIMAGE；当前只发行 AppImage 与 deb 两种 Linux 形态。
      return options.appImage ? 'appimage' : 'deb'
    }
    default: {
      return 'unknown'
    }
  }
}
