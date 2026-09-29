import { lstat, mkdir, open, realpath, rmdir, unlink } from 'node:fs/promises'
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
        [...part].some((char) => char.charCodeAt(0) < 32) ||
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

/** 独占种子的顶层名称，避免直接写入保存目录时覆盖已有文件或混用其他任务目录。 */
export async function reserveTorrentPaths(root: string, files: Array<{ path: string }>) {
  const entries = new Map<string, boolean>()
  for (const file of files) {
    validateTorrentPath(file.path)
    const parts = file.path.split('/')
    const directory = parts.length > 1
    if (entries.has(parts[0]) && entries.get(parts[0]) !== directory)
      throw new Error('种子包含冲突的文件和目录名称')
    entries.set(parts[0], directory)
    await safeTaskPath(root, file.path)
  }
  const created: Array<{ target: string; directory: boolean }> = []
  try {
    for (const [name, directory] of entries) {
      const target = path.join(root, name)
      try {
        if (directory) await mkdir(target)
        else await (await open(target, 'wx')).close()
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST')
          throw new Error(`保存目录中已存在「${name}」，请选择其他保存目录`)
        throw error
      }
      created.push({ target, directory })
    }
  } catch (error) {
    // 只回收本次预留的空目录或占位文件，绝不递归删除保存目录。
    for (const item of created.reverse())
      await (item.directory ? rmdir(item.target) : unlink(item.target)).catch(() => {})
    throw error
  }
}

/** 仅清理任务文件的空父目录，始终止于保存目录；不递归删除目录内容。 */
export async function removeEmptyTaskDirectories(root: string, files: Array<{ path: string }>) {
  const directories = new Set<string>()
  for (const file of files) {
    validateTorrentPath(file.path)
    const parts = file.path.split('/')
    parts.pop()
    while (parts.length) {
      directories.add(parts.join('/'))
      parts.pop()
    }
  }
  // 先删子目录再删父目录；同一目录只尝试一次，非空即保留。
  const deepestFirst = [...directories].sort((a, b) => b.split('/').length - a.split('/').length)
  for (const relative of deepestFirst) {
    const target = await safeTaskPath(root, relative)
    await rmdir(target).catch((error: NodeJS.ErrnoException) => {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code ?? '')) throw error
    })
  }
}
