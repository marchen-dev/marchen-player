import type { DB_Danmaku } from '@renderer/database/schemas/history'
import type { CommentModel } from '@renderer/request/models/comment'

/**
 * 将32位整数表示的颜色转换成十六进制颜色格式
 */
export function intToHexColor(color: number | string): string {
  if (typeof color === 'string' && color.startsWith('#')) {
    return color
  }
  const _color = +color
  const r = (_color >> 16) & 0xFF
  const g = (_color >> 8) & 0xFF
  const b = _color & 0xFF

  const rHex = r.toString(16).padStart(2, '0')
  const gHex = g.toString(16).padStart(2, '0')
  const bHex = b.toString(16).padStart(2, '0')

  return `#${rHex}${gHex}${bHex}`
}

type Mode = 'top' | 'bottom' | 'scroll'
export const DanmuPosition: Record<number, Mode> = {
  1: 'scroll',
  4: 'bottom',
  5: 'top',
}

/**
 * 获取弹幕源的显示名称
 */
export const danmakuPlatformMap = (danmaku?: DB_Danmaku) => {
  if (!danmaku) {
    return '未知弹幕'
  }

  let mapName = ''
  switch (danmaku.type) {
    case 'auto': {
      mapName = '弹弹play'
      break
    }
    case 'local': {
      mapName = '本地弹幕'
      break
    }
    default: {
      mapName = '未知弹幕'
      break
    }
  }

  return `${mapName} (${danmaku.content.count}条)`
}

/**
 * 获取弹幕数量最多的源的显示名称
 */
export const mostDanmakuPlatform = (danmaku?: DB_Danmaku[]) => {
  if (!danmaku || danmaku.length === 0) {
    return '暂无弹幕'
  }
  const danmakuCount = danmaku.filter((item) => item.selected).map((item) => item.content.count)
  if (danmakuCount.length === 0) {
    return '暂无弹幕'
  }
  const maxDanmakuItem = danmaku.find((item) => item.content.count === Math.max(...danmakuCount))
  return danmakuPlatformMap(maxDanmakuItem)
}

/**
 * 将弹幕数据解析为播放器可用的格式
 */
export const parseDanmakuData = (params: { danmuData?: CommentModel[]; duration: number }) =>
  params.danmuData?.map((comment) => {
    const [start, postition, color] = comment.p.split(',')
    const startInMs = +start * 1000
    const mode = DanmuPosition[+postition]
    const danmakuColor = intToHexColor(color)
    return {
      duration: params.duration,
      id: comment.cid,
      start: startInMs,
      txt: comment.m,
      mode,
      style: {
        color: danmakuColor,
        fontWeight: 600,
        textShadow: `
      rgb(0, 0, 0) 1px 0px 1px,
      rgb(0, 0, 0) 0px 1px 1px,
      rgb(0, 0, 0) 0px -1px 1px,
      rgb(0, 0, 0) -1px 0px 1px
    `,
      },
    }
  })

/**
 * 合并所有选中的弹幕源为一个 CommentModel 数组
 */
export const mergeDanmaku = (danmakuData: DB_Danmaku[] | undefined) => {
  if (!danmakuData) {
    return
  }
  return danmakuData
    .filter((danmaku) => danmaku.selected)
    .map((danmaku) => danmaku?.content)
    .flatMap((danmaku) => danmaku.comments)
}
