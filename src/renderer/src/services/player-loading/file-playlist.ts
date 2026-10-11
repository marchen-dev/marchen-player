import { isVideoFile } from '@marchen/shared/media'

/** 用户选择的文件只在当前页面持有；刷新后重新授权，不把 File 或临时 URL 写进列表历史。 */
let files: File[] = []
let paths: string[] = []
const ids = new WeakMap<File, string>()
const hashes = new WeakMap<File, string>()
const compare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
const basename = (path: string) => path.split(/[\\/]/).pop() || path

export function selectFileBatch(selected: readonly File[]) {
  const accepted = [...new Set(selected)]
    .filter((file) => isVideoFile(file.name))
    .sort((a, b) => compare(a.name, b.name))
  if (typeof window !== 'undefined' && window.electron)
    selectPathBatch(accepted.map((file) => window.api.showFilePath(file)))
  else files = accepted
  return accepted
}
export function selectPathBatch(selected: readonly string[]) {
  const accepted = [...new Set(selected)]
    .filter(isVideoFile)
    .sort((a, b) => compare(basename(a), basename(b)))
  // 单个文件不构成用户指定的列表，交给主进程扫描同目录；多选时才以选择集合覆盖
  paths = accepted.length > 1 ? accepted : []
  return accepted
}
export function rememberWebFile(file: File, hash: string) {
  if (!files.includes(file)) files = [file]
  hashes.set(file, hash)
}
export function getWebPlaylist() {
  return files.map((file) => {
    let id = ids.get(file)
    if (!id) {
      id = crypto.randomUUID()
      ids.set(file, id)
    }
    return { id, file, name: file.name, fileHash: hashes.get(file) }
  })
}
export function getSelectedPathPlaylist(current: string) {
  return paths.includes(current)
    ? paths.map((path) => ({ id: path, path, name: basename(path) }))
    : null
}
