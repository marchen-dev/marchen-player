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
