import type { DB_Danmaku } from '@renderer/database/schemas/history'
import type { CommentModel } from '@renderer/request/models/comment'

/**
 * 将32位整数表示的颜色转换成十六进制颜色格式
 * @param color 32位整数表示的颜色
 * @returns 十六进制颜色格式字符串，例如 #ffffff
 */
export function intToHexColor(color: number | string): string {
  if (typeof color === 'string' && color.startsWith('#')) {
    return color
  }
  const _color = +color
  // 提取红色分量
  const r = (_color >> 16) & 0xff
  // 提取绿色分量
  const g = (_color >> 8) & 0xff
  // 提取蓝色分量
  const b = _color & 0xff

  // 将每个分量转换成两位的十六进制字符串
  const rHex = r.toString(16).padStart(2, '0')
  const gHex = g.toString(16).padStart(2, '0')
  const bHex = b.toString(16).padStart(2, '0')

  // 拼接结果
  return `#${rHex}${gHex}${bHex}`
}

type Mode = 'top' | 'bottom' | 'scroll'
export const DanmuPosition: Record<number, Mode> = {
  1: 'scroll',
  4: 'bottom',
  5: 'top',
}

const thirdpartyDanmakuMap = {
  bilibili: '哔哩哔哩',
  'ani.gamer.com.tw': '巴哈姆特动漫疯',
  acfun: 'AcFun',
  tucao: '吐槽弹幕网',
  iqiyi: '爱奇艺',
  youku: '优酷',
}

export const danmakuPlatformMap = (danmaku?: DB_Danmaku) => {
  if (!danmaku) {
    return '未知弹幕'
  }
  let mapName = ''

  switch (danmaku.type) {
    case 'dandanplay': {
      mapName = '弹弹play'
      break
    }
    case 'local': {
      mapName = '本地弹幕'
      break
    }

    case 'third-party-manual':
    case 'third-party-auto': {
      Object.entries(thirdpartyDanmakuMap).forEach(([key, value]) => {
        danmaku.source?.includes(key) && (mapName = value)
      })
      if (!mapName) {
        mapName = new URL(danmaku.source || '').hostname
      }
      break
    }
    default: {
      mapName = '未知弹幕'
      break
    }
  }

  return `${mapName} (${danmaku.content.count}条)`
}

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

export const parseDanmakuData = (params: { danmuData?: CommentModel[]; duration: number }) =>
  params.danmuData?.map((comment) => {
    const [start, postition, color] = comment.p.split(',')
    const startInMs = +start * 1000
    const mode = DanmuPosition[+postition]
    const danmakuColor = intToHexColor(color)
    return {
      duration: params.duration, // 弹幕持续显示时间,毫秒(最低为5000毫秒)
      id: comment.cid, // 弹幕id，需唯一
      start: startInMs, // 弹幕出现时间，毫秒BB
      txt: comment.m, // 弹幕文字内容
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

export const mergeDanmaku = (danmakuData: DB_Danmaku[] | undefined) => {
  if (!danmakuData) {
    return
  }
  return danmakuData
    .filter((danmaku) => danmaku.selected)
    .map((danmaku) => danmaku?.content)
    .flatMap((danmaku) => danmaku.comments)
}
