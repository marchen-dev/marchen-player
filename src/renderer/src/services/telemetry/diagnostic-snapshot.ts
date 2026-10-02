import { playerSettingAtom } from '@renderer/atoms/settings/player'
import { jotaiStore } from '@renderer/atoms/store'
import { getCompatSupport } from '@renderer/services/player-runtime/compat-support'

import { writeLocalLog } from './local-log'

/** 用 canPlayType 粗测原生解码能力；同步、无副作用，足够判断「为什么这个视频播不了」 */
const CODEC_PROBES: Record<string, string> = {
  h264: 'video/mp4; codecs="avc1.640028"',
  hevc: 'video/mp4; codecs="hvc1.1.6.L120.90"',
  hevc_main10: 'video/mp4; codecs="hvc1.2.4.L120.90"',
  av1: 'video/mp4; codecs="av01.0.08M.08"',
  vp9: 'video/webm; codecs="vp9"',
  aac: 'audio/mp4; codecs="mp4a.40.2"',
  ac3: 'audio/mp4; codecs="ac-3"',
  eac3: 'audio/mp4; codecs="ec-3"',
  opus: 'audio/webm; codecs="opus"',
}

const probeCodecs = () => {
  const video = document.createElement('video')
  return Object.fromEntries(
    Object.entries(CODEC_PROBES).map(([name, type]) => [name, video.canPlayType(type) || 'no']),
  )
}

/**
 * renderer 启动环境快照：兼容内核支持、解码能力与关键播放设置。
 * 每次加载页面写一次，Web 端尤其依赖它判断编码与跨域隔离问题。
 */
export function writeRendererSnapshot() {
  try {
    const settings = jotaiStore.get(playerSettingAtom)
    writeLocalLog({
      lv: 'info',
      cat: 'app',
      msg: 'renderer_start',
      data: {
        target: __MARCHEN_TARGET__,
        release: __MARCHEN_RELEASE__,
        userAgent: navigator.userAgent,
        language: navigator.language,
        crossOriginIsolated: globalThis.crossOriginIsolated,
        screen: `${screen.width}x${screen.height}@${devicePixelRatio}`,
        compat: getCompatSupport(),
        codecs: probeCodecs(),
        player: {
          enginePreference: settings.enginePreference,
          subtitleScale: settings.subtitleScale,
          enableDanmaku: settings.enableDanmaku,
        },
      },
    })
  } catch (error) {
    console.warn('[local-log] 写入环境快照失败', error)
  }
}
