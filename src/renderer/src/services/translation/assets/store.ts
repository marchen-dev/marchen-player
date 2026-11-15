/**
 * 翻译资源的本机存放层。
 *
 * 使用浏览器的私有文件系统（OPFS）：Electron（`marchen://app`）与 Web 都可用、重启后保留，
 * 几十 MB 的文件直接按文件读写。上层只依赖这里的接口，不关心具体介质。
 * Web 上这块存储可能被浏览器回收，调用方须把「文件不在」当作常态并重新下载。
 */

const DIRECTORY = 'translation'

export interface TranslationAssetStore {
  /** 文件存在且大小与预期一致；大小不符视为不存在（残缺或旧版本） */
  has: (name: string, size: number) => Promise<boolean>
  read: (name: string) => Promise<ArrayBuffer | null>
  write: (name: string, data: ArrayBuffer) => Promise<void>
  remove: (name: string) => Promise<void>
  /** 目录下全部文件的字节数之和 */
  usage: () => Promise<number>
  clear: () => Promise<void>
}

export const isAssetStoreSupported = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function'

const isNotFound = (error: unknown) =>
  error instanceof DOMException && error.name === 'NotFoundError'

async function openDirectory(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  const root = await navigator.storage.getDirectory()
  try {
    return await root.getDirectoryHandle(DIRECTORY, { create })
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

async function openFile(name: string): Promise<File | null> {
  const directory = await openDirectory(false)
  if (!directory) return null
  try {
    return await (await directory.getFileHandle(name)).getFile()
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

export const opfsAssetStore: TranslationAssetStore = {
  async has(name, size) {
    return (await openFile(name))?.size === size
  },

  async read(name) {
    return (await (await openFile(name))?.arrayBuffer()) ?? null
  },

  async write(name, data) {
    const directory = (await openDirectory(true))!
    const handle = await directory.getFileHandle(name, { create: true })
    // createWritable 先写临时文件、close 时才替换，中途失败不会留下残缺的正式文件
    const writable = await handle.createWritable()
    try {
      await writable.write(data)
      await writable.close()
    } catch (error) {
      await writable.abort().catch(() => {})
      throw error
    }
  },

  async remove(name) {
    const directory = await openDirectory(false)
    if (!directory) return
    try {
      await directory.removeEntry(name)
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
  },

  async usage() {
    const directory = await openDirectory(false)
    if (!directory) return 0
    let total = 0
    // lib.dom 尚未声明目录句柄的异步迭代器，这里按规范补上类型
    const entries = (
      directory as unknown as { values: () => AsyncIterable<FileSystemHandle> }
    ).values()
    for await (const entry of entries) {
      if (entry.kind === 'file') total += (await (entry as FileSystemFileHandle).getFile()).size
    }
    return total
  },

  async clear() {
    const root = await navigator.storage.getDirectory()
    try {
      await root.removeEntry(DIRECTORY, { recursive: true })
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
  },
}
