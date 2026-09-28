import { fetchBilibili, recognizeBilibili } from './bilibili'
import { fetchYouku, recognizeYouku } from './youku'

/** 首版静态注册，新增平台无需改输入组件或任务调度。 */
const adapters = [
  { recognize: recognizeYouku, fetch: fetchYouku },
  { recognize: recognizeBilibili, fetch: fetchBilibili },
]
export function resolveAdapter(url: string) {
  if (typeof url !== 'string' || url.length > 4096) throw new Error('请输入有效的视频页面链接')
  for (const adapter of adapters) {
    const identity = adapter.recognize(url.trim())
    if (identity) return { identity, fetch: adapter.fetch }
  }
  throw new Error('暂不支持此视频链接')
}
