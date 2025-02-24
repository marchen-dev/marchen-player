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

  const { userAgent } = window.navigator,
    { platform } = window.navigator,
    macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'],
    windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'],
    iosPlatforms = ['iPhone', 'iPad', 'iPod']
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

export const checkIsVideoType = (videoName: string) => {
  const videoSuffix = videoName?.split('.').pop()?.toLowerCase()
  return videoSuffix === 'mp4' || videoSuffix === 'mkv'
}

export const isChromiumBased = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase()
  return userAgent.includes('chrome') || userAgent.includes('chromium')
}
