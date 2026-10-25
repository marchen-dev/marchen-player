import type { PersistentMediaSource } from '@marchen/shared/media'
import { providerHistoryKey } from '@marchen/shared/media'
import { validateRemoteUrl } from '@marchen/shared/media/remote'

const WINDOWS_DRIVE_PATH = /^[a-z]:[\\/]/i
const INTERNAL_MEDIA_ROUTE = /\/v1\/media\//i

export const isForbiddenPersistentMediaPath = (value: string): boolean => {
  if (WINDOWS_DRIVE_PATH.test(value)) return false
  if (/^(?:marchen|blob|file):/i.test(value)) return true
  if (/^https?:/i.test(value)) return true
  if (INTERNAL_MEDIA_ROUTE.test(value) || /\.m3u8(?:$|[?#])/i.test(value)) return true
  return false
}

export const assertPersistentMediaPath = (record: { source?: PersistentMediaSource }): void => {
  if (record.source?.kind === 'remote-url') {
    validateRemoteUrl(record.source.url)
    if (!record.source.hash.startsWith('remote:')) throw new TypeError('网络视频记录标识无效')
    return
  }
  if (record.source?.kind === 'provider-item') {
    const { sourceId, itemRef, hash } = record.source
    // 条目引用必须是来源内的路径或 id；地址形式说明调用方误把播放地址写了进来。
    if (!sourceId || !itemRef || /^(?:https?|marchen|blob|file):/i.test(itemRef))
      throw new TypeError('媒体源记录只能保存条目引用，不能保存播放地址')
    if (hash !== providerHistoryKey(sourceId, itemRef)) throw new TypeError('媒体源记录标识无效')
    return
  }
  if (record.source?.kind !== 'electron-file') return
  if (!record.source.path || isForbiddenPersistentMediaPath(record.source.path))
    throw new TypeError('HISTORY.source.path 只能保存原始文件路径，不能保存临时播放地址')
}
