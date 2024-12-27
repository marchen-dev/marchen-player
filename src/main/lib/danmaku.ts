export const parseBilibiliDanmaku = (params: { danmakus: BilibliDanmakuItem[] }) => {
  const { danmakus } = params
  return danmakus.map((item) => {
    const [time, type, _, color, timestamp] = item.$.p.split(',').map(Number)
    const txt = item._
    return {
      cid: timestamp,
      m: txt,
      p: `${time},${type},${decimalToHex(color)},${timestamp}`,
    }
  })
}

type Mode = 'top' | 'bottom' | 'scroll'
export const DanmuPosition: Record<number, Mode> = {
  1: 'scroll',
  4: 'bottom',
  5: 'top',
}

export interface BilibliDanmakuItem {
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
    d: BilibliDanmakuItem[]
  }
}

export const decimalToHex = (decimal: number): string => {
  return `#${decimal.toString(16).padStart(6, '0').toUpperCase()}`
}
