/**
 * 弹幕翻译的状态说明：由状态码与数值得出设置行里的那一行文字。
 * 服务层只产出状态（status.ts），文字在这里按当前界面语言生成，文案本身在 packages/i18n。
 */
import type { DanmakuTranslationStatus } from './status'
import { formatNumber, t } from '@renderer/lib/i18n'

/** 首次下载的大致体积（gzip 后），仅用于确认提示 */
export const APPROXIMATE_DOWNLOAD_SIZE = '50 MB'

const percent = (loaded: number, total: number) =>
  total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : 0

/** 设置行副标题；不需要副标题时返回 null */
export function describeTranslationStatus(status: DanmakuTranslationStatus): string | null {
  switch (status.state) {
    case 'unsupported':
      return t(`danmaku:translation.unsupported.${status.reason}`)
    case 'off':
      // 未开启时不显示副标题：下拉框选中的「不翻译」已经说明了状态
      return null
    case 'preparing':
      return t('danmaku:translation.status.preparing', {
        percent: percent(status.loaded, status.total),
      })
    case 'confirming':
      return t('danmaku:translation.status.confirming')
    case 'downloading':
      return t('danmaku:translation.status.downloading', {
        percent: percent(status.loaded, status.total),
      })
    case 'download_failed':
      return t(`errors:translation.${status.code}`)
    case 'ready':
      return t('danmaku:translation.status.ready')
    case 'starting':
      return t('danmaku:translation.status.starting')
    case 'translating':
      return t('danmaku:translation.status.translating', {
        done: formatNumber(status.done),
        total: formatNumber(status.total),
      })
    case 'done':
      return t('danmaku:translation.status.done', { total: formatNumber(status.total) })
    case 'engine_failed':
      return t('danmaku:translation.status.engineFailed')
  }
}
