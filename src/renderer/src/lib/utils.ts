import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { memoize } from 'lodash-es'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type OS = 'macOS' | 'iOS' | 'Windows' | 'Android' | 'Linux' | ''
export const getOS = memoize((): OS => {
  if (window.platform) {
    switch (window.platform) {
      case 'darwin': {
        return 'macOS'
      }
      case 'win32': {
        return 'Windows'
      }
      case 'linux': {
        return 'Linux'
      }
    }
  }

  const { userAgent } = window.navigator
  const { platform } = window.navigator
  const macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K']
  const windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE']
  const iosPlatforms = ['iPhone', 'iPad', 'iPod']
  let os = ''

  if (macosPlatforms.includes(platform)) {
    os = 'macOS'
  } else if (iosPlatforms.includes(platform)) {
    os = 'iOS'
  } else if (windowsPlatforms.includes(platform)) {
    os = 'Windows'
  } else if (/Android/.test(userAgent)) {
    os = 'Android'
  } else if (!os && /Linux/.test(platform)) {
    os = 'Linux'
  }

  return os as OS
})

export const isMac = getOS() === 'macOS' && window.electron
export const isWindows = getOS() === 'Windows' && window.electron
export const isWeb = !window.electron

/** 手机屏幕短边上限（CSS 像素）；主流手机在 320～440，平板通常 ≥ 600 */
const PHONE_SCREEN_SHORT_SIDE = 600

/**
 * 是否为手机访问网页版。产品只支持桌面端，用于给手机用户提示改用电脑打开。
 *
 * - UA 判定排除桌面端：Chromium 用 `userAgentData.mobile`，其余看 UA 关键字；
 *   Android 平板 UA 不含 `Mobile`，iPadOS 默认伪装成 Mac，因此平板不会命中。
 * - 屏幕短边兜底排除 UA 不规范的大屏设备；用 `screen` 而非窗口宽度，
 *   避免横竖屏切换或桌面端缩窄窗口影响结论。
 */
export const isPhone = (() => {
  if (!isWeb) return false
  const { userAgent, userAgentData } = navigator as Navigator & {
    userAgentData?: { mobile?: boolean }
  }
  const mobileUA = userAgentData?.mobile === true || /iPhone|iPod|Android.*Mobile/i.test(userAgent)
  return mobileUA && Math.min(screen.width, screen.height) < PHONE_SCREEN_SHORT_SIDE
})()

/** 「在系统文件管理器中定位文件」的平台文案，历史记录与影视库右键菜单共用 */
export const getRevealInFileManagerLabel = (os: OS = getOS()) => {
  switch (os) {
    case 'macOS': {
      return '在 Finder 中显示'
    }
    case 'Windows': {
      return '在资源管理器中显示'
    }
    default: {
      return '在文件管理器中显示'
    }
  }
}

export { isVideoFile as checkIsVideoType } from '@marchen/shared/media'

export const isChromiumBased = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase()
  return userAgent.includes('chrome') || userAgent.includes('chromium')
}
