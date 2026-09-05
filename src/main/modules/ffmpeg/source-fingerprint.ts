import type { MediaSourceFingerprint } from '@marchen/shared/media'

import { createHash } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { normalize, resolve } from 'node:path'
import { INPUT_MEDIA_FACTS_SCHEMA_VERSION } from '@marchen/shared/media'

const canonicalPathKey = (path: string): string => {
  const normalized = normalize(path)
  // Windows 路径与盘符大小写不应产生两个缓存身份；macOS 保留文件系统原始语义。
  const comparable = process.platform === 'win32' ? normalized.toLowerCase() : normalized
  return createHash('sha256').update(comparable).digest('hex')
}

/** 只返回不可逆路径 key 与文件状态，绝不把规范绝对路径放入 probe IPC。 */
export const createMediaSourceFingerprint = async (
  inputPath: string,
  sourceId: string,
): Promise<MediaSourceFingerprint> => {
  const [statistics, canonicalPath] = await Promise.all([
    stat(inputPath),
    realpath(inputPath).catch(() => resolve(inputPath)),
  ])
  if (!statistics.isFile()) throw new Error('媒体来源不是普通文件')
  return {
    schemaVersion: INPUT_MEDIA_FACTS_SCHEMA_VERSION,
    sourceId,
    pathKey: canonicalPathKey(canonicalPath),
    size: statistics.size,
    mtimeMs: statistics.mtimeMs,
  }
}
