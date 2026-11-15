import { UserError } from '@marchen/shared/errors'
import { fetchBilibili, recognizeBilibili } from './bilibili'
import { fetchYouku, recognizeYouku } from './youku'

/** 首版静态注册，新增平台无需改输入组件或任务调度。 */
const adapters = [
  { recognize: recognizeYouku, fetch: fetchYouku },
  { recognize: recognizeBilibili, fetch: fetchBilibili },
]
export function resolveAdapter(url: string) {
  if (typeof url !== 'string' || url.length > 4096)
    throw new UserError('danmakuLink.invalid_url', '请输入有效的视频页面链接')
  for (const adapter of adapters) {
    const identity = adapter.recognize(url.trim())
    if (identity) return { identity, fetch: adapter.fetch }
  }
  throw new UserError('danmakuLink.unsupported_url', '暂不支持此视频链接')
}
