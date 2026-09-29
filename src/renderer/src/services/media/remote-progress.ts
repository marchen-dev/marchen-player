import { atom } from 'jotai'

/** 仅运行时 UI 状态，不持久化链接或统计数据。 */
export const remoteImportProgressAtom = atom<{
  id: string
  stage: 'connecting' | 'reading'
  received: number
  total: number
} | null>(null)
export const activeRemoteLeaseAtom = atom<{ id: string } | null>(null)
export function formatMediaBytes(bytes: number) {
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`
  return `${(bytes / 1024).toFixed(1)} KiB`
}
