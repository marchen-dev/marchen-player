import { parseStringPromise } from 'xml2js'

export const parseBilibiliDanmaku = async (params: {
  fileData: string
  type: '.xml' | '.json'
}) => {
  const { fileData, type } = params
  switch (type) {
    case '.xml': {
      const result = (await parseStringPromise(fileData)) as BilibiliXmlDanmakus
      const danmakus = result.i.d
      return danmakus?.map((item) => {
        const [time, type, _, color, timestamp] = item.$.p.split(',').map(Number)
        const txt = item._
        return {
          cid: timestamp,
          m: txt,
          p: `${time},${type},${decimalToHex(color)},${timestamp}`,
        }
      })
    }
    case '.json': {
      const danmakus = JSON.parse(fileData) as BilibiliJsonDanmakuItem[]
      return danmakus.map((item) => ({
        cid: item.ctime,
        m: item.content,
        p: `${((item?.progress ?? 0) / 1000).toFixed(1)},${item.mode},${decimalToHex(item.color)},${item.id}`,
      }))
    }
  }
}

type Mode = 'top' | 'bottom' | 'scroll'
export const DanmuPosition: Record<number, Mode> = {
  1: 'scroll',
  4: 'bottom',
  5: 'top',
}

export interface BilibliXmlDanmakuItem {
  _: string
  $: {
    p: string
  }
}

export interface BilibiliXmlDanmakus {
  i: {
    chatserver: string[]
    chatid: string[]
    mission: string[]
    maxlimit: string[]
    state: string[]
    real_name: string[]
    source: string[]
    d: BilibliXmlDanmakuItem[]
  }
}

interface BilibiliJsonDanmakuItem {
  id: number // 评论的唯一标识符
  mode: number // 弹幕的显示模式（例如滚动、顶部、底部等）
  progress?: number // 弹幕的显示进度
  fontsize: number // 字体大小
  color: number // 字体颜色，通常为十进制表示的 RGB 值
  midHash: string // 用户的哈希值，可能是用于匿名标识用户
  content: string // 弹幕内容
  ctime: number // 创建时间，通常是 UNIX 时间戳
  weight: number // 权重，可能影响弹幕的显示优先级
  idStr: string // 字符串形式的唯一标识符
  attr: number // 弹幕的附加属性
}

export const decimalToHex = (decimal?: number): string => {
  if (!decimal) {
    return '#FFFFFF'
  }
  return `#${decimal.toString(16).padStart(6, '0').toUpperCase()}`
}
