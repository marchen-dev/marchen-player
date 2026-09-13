import type { PersistentMediaSource } from '@marchen/shared/media'

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
  if (record.source?.kind !== 'electron-file') return
  if (!record.source.path || isForbiddenPersistentMediaPath(record.source.path))
    throw new TypeError('HISTORY.source.path 只能保存原始文件路径，不能保存临时播放地址')
}
