import type { DB_Danmaku } from '@renderer/database/schemas/history'
import type { CommentModel } from '@renderer/request/models/comment'
import { mergeSources } from '@marchen/shared/danmaku'

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
 * 获取弹幕源的短名称（不带条数），供来源列表、弹幕列表的来源列与筛选项共用
 */
export const danmakuSourceName = (danmaku?: DB_Danmaku) => {
  if (!danmaku) {
    return '未知弹幕'
  }

  switch (danmaku.type) {
    case 'auto': {
      return '弹弹play'
    }
    case 'link': {
      // 视频标题里常见「𝟒𝐊」这类数学粗体字符，会让整段文字回退到衬线字体；
      // NFKC 归一化为普通字符后与界面其余文字保持同一字体，仅影响显示，不改动存储的标题
      return danmaku.title.normalize('NFKC')
    }
    case 'local': {
      if (danmaku.source.startsWith('local-file:')) {
        try {
          return decodeURIComponent(danmaku.source.slice(danmaku.source.indexOf('/') + 1))
        } catch {
          // 旧缓存或损坏的来源标识仍显示通用名称。
        }
      }
      return '本地弹幕'
    }
    default: {
      return '未知弹幕'
    }
  }
}

/**
 * 获取弹幕源的显示名称
 */
export const danmakuPlatformMap = (danmaku?: DB_Danmaku) => {
  if (!danmaku) {
    return '未知弹幕'
  }

  return `${danmakuSourceName(danmaku)} (${danmaku.content.count}条)`
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
export const mergeDanmaku = (entries: DB_Danmaku[] | undefined) => entries && mergeSources(entries)
