import { t } from '@renderer/lib/i18n'
import { getVideoGenerator } from '../media/compat/video-frame-presenter'

/** 产品支持范围：Electron 和具备解码 API 的桌面 Chromium，暂不开放 Safari/Firefox。 */
export function detectCompatSupport(userAgent: string, electron: boolean, hasApis: boolean) {
  const supported =
    hasApis &&
    (electron ||
      (/(?:Chrome|Chromium|Edg)\//.test(userAgent) &&
        !/(?:Firefox|FxiOS|CriOS|EdgiOS)\//.test(userAgent)))
  return {
    supported,
    reason: supported ? undefined : t('player:engine.compatUnsupported'),
  }
}

export const getCompatSupport = () =>
  detectCompatSupport(
    typeof navigator === 'undefined' ? '' : navigator.userAgent,
    typeof window !== 'undefined' && Boolean(window.electron),
    typeof VideoDecoder !== 'undefined' &&
      typeof getVideoGenerator() === 'function' &&
      typeof HTMLVideoElement !== 'undefined' &&
      typeof HTMLVideoElement.prototype.requestVideoFrameCallback === 'function' &&
      typeof AudioContext !== 'undefined' &&
      typeof Worker !== 'undefined' &&
      typeof WebAssembly !== 'undefined',
  )
