/** 产品支持范围：Electron 和具备解码 API 的桌面 Chromium，暂不开放 Safari/Firefox。 */
export function detectCanvasSupport(userAgent: string, electron: boolean, hasApis: boolean) {
  const supported =
    hasApis &&
    (electron ||
      (/(?:Chrome|Chromium|Edg)\//.test(userAgent) &&
        !/(?:Firefox|FxiOS|CriOS|EdgiOS)\//.test(userAgent)))
  return {
    supported,
    reason: supported
      ? undefined
      : '当前浏览器暂不支持 Canvas 内核，请使用原生（H5）播放，或换用桌面 Chrome / Edge。',
  }
}

export const getCanvasSupport = () =>
  detectCanvasSupport(
    typeof navigator === 'undefined' ? '' : navigator.userAgent,
    typeof window !== 'undefined' && Boolean(window.electron),
    typeof VideoDecoder !== 'undefined' &&
      typeof AudioContext !== 'undefined' &&
      typeof Worker !== 'undefined' &&
      typeof WebAssembly !== 'undefined',
  )
