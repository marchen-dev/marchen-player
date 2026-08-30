export type HistoryPathMigrationResult =
  | { status: 'ready'; path: string; migrated: boolean }
  | { status: 'unresolved'; path: string; originalPath: string; reason: string }

const decodeLegacyPath = (value: string): string | undefined => {
  try {
    const decoded = decodeURIComponent(value)
    return decoded.includes('\0') ? undefined : decoded
  } catch {
    return undefined
  }
}

const normalizeSegments = (value: string, separator: '/' | '\\'): string => {
  const segments: string[] = []
  for (const segment of value.split(/[\\/]+/)) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments.join(separator)
}

/** 数据库迁移运行在 Renderer，不能依赖会被 Vite externalize 的 node:path。 */
const normalizePosixPath = (value: string): string => `/${normalizeSegments(value, '/')}`

const normalizeWindowsPath = (value: string): string => {
  const normalizedSeparators = value.replaceAll('/', '\\')
  const drive = normalizedSeparators.match(/^([a-z]):\\(.*)$/i)
  if (drive) {
    const tail = normalizeSegments(drive[2]!, '\\')
    return `${drive[1]!.toUpperCase()}:\\${tail}`
  }
  const unc = normalizedSeparators.match(/^\\\\([^\\]+)\\([^\\]+)(?:\\(.*))?$/)
  if (unc) {
    const tail = normalizeSegments(unc[3] ?? '', '\\')
    return `\\\\${unc[1]}\\${unc[2]}${tail ? `\\${tail}` : ''}`
  }
  return normalizedSeparators
}

const migrateWindowsPath = (originalPath: string, body: string): HistoryPathMigrationResult => {
  const drivePath = body.match(/^\/{2,3}([a-z]):?[\\/](.+)$/i)
  if (drivePath) {
    return {
      status: 'ready',
      path: normalizeWindowsPath(`${drivePath[1]!.toUpperCase()}:\\${drivePath[2]}`),
      migrated: true,
    }
  }

  const directDrivePath = body.match(/^\/?([a-z]:[\\/].+)$/i)
  if (directDrivePath) {
    return {
      status: 'ready',
      path: normalizeWindowsPath(directDrivePath[1]!),
      migrated: true,
    }
  }

  if (/^\/\/[^/\\]+[\\/][^/\\]+/.test(body)) {
    return {
      status: 'ready',
      path: normalizeWindowsPath(`\\\\${body.slice(2).replaceAll('/', '\\')}`),
      migrated: true,
    }
  }

  return {
    status: 'unresolved',
    path: originalPath,
    originalPath,
    reason: '旧 Windows marchen URL 无法无歧义恢复为盘符或 UNC 路径',
  }
}

export const migrateLegacyHistoryPath = (
  originalPath: string,
  platform: 'darwin' | 'win32' = navigator.platform.toLowerCase().includes('win')
    ? 'win32'
    : 'darwin',
): HistoryPathMigrationResult => {
  if (!originalPath.toLowerCase().startsWith('marchen:')) {
    return { status: 'ready', path: originalPath, migrated: false }
  }
  const body = decodeLegacyPath(originalPath.slice('marchen:'.length))
  if (body === undefined) {
    return {
      status: 'unresolved',
      path: originalPath,
      originalPath,
      reason: '旧 marchen URL 包含无效转义或空字符',
    }
  }

  if (platform === 'win32') return migrateWindowsPath(originalPath, body)

  const candidate = body.startsWith('//') ? body.slice(2) : body
  if (candidate.startsWith('/')) {
    return { status: 'ready', path: normalizePosixPath(candidate), migrated: true }
  }
  return {
    status: 'unresolved',
    path: originalPath,
    originalPath,
    reason: '旧 marchen URL 不是可确认的绝对路径',
  }
}
