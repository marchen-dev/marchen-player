export interface PersistentMediaPathRecord {
  path?: string
  pathStatus?: 'ready' | 'unresolved'
  originalPath?: string
  pathMigrationError?: string
}

const WINDOWS_DRIVE_PATH = /^[a-z]:[\\/]/i
const INTERNAL_MEDIA_ROUTE = /\/v1\/media\//i

export const isForbiddenPersistentMediaPath = (value: string): boolean => {
  if (WINDOWS_DRIVE_PATH.test(value)) return false
  if (/^(?:marchen|blob|file):/i.test(value)) return true
  if (/^https?:/i.test(value)) return true
  if (INTERNAL_MEDIA_ROUTE.test(value) || /\.m3u8(?:$|[?#])/i.test(value)) return true
  return false
}

export const assertPersistentMediaPath = (record: PersistentMediaPathRecord): void => {
  if (!record.path || !isForbiddenPersistentMediaPath(record.path)) return
  const retainedLegacyRecord =
    record.pathStatus === 'unresolved' &&
    record.originalPath === record.path &&
    Boolean(record.pathMigrationError)
  if (retainedLegacyRecord) return
  throw new TypeError('HISTORY.path 只能保存原始文件路径，不能保存临时播放地址')
}
