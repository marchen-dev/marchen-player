import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { DOWNLOAD_LIMITS } from '@marchen/shared/downloads'

export function validateTorrentPath(value: string) {
  const parts = value.split('/')
  if (
    !value ||
    value.length > 1024 ||
    parts.length > DOWNLOAD_LIMITS.pathDepth ||
    path.isAbsolute(value) ||
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        /[\\<>:"|?*]/.test(part) ||
        [...part].some(char => char.charCodeAt(0) < 32) ||
        /[. ]$/.test(part) ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
    )
  ) {
    throw new Error('种子包含不安全或不兼容的文件路径')
  }
  return value
}

/** 在读写前逐级检查，拒绝符号链接穿出任务目录。 */
export async function safeTaskPath(root: string, relative: string) {
  validateTorrentPath(relative)
  const canonical = await realpath(root)
  let current = canonical
  for (const part of relative.split('/')) {
    current = path.join(current, part)
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('下载目录内不允许符号链接')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return current
}
