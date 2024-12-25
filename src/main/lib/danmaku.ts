export const parseBilibiliDanmaku = (params: {
  danmakus: BilibliDanmakuItem[]
  duration: number
}) => {
  const { danmakus, duration } = params
  return danmakus.map((item) => {
     
    const [time, type, _, color, timestamp] = item.$.p.split(',')
    const mode = DanmuPosition[type]
    const txt = item._
    return {
      id: +timestamp,
      start: +time * 1000,
      txt,
      mode,
      duration,
      style: {
        color,
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
