import type { DownloadResult, DownloadSnapshot } from '@marchen/shared/downloads'
import { toast } from '@renderer/components/ui/toast/use-toast'
import { atom } from 'jotai'
export const downloadsAtom = atom<DownloadSnapshot | null>(null)
export const torrentRequestAtom = atom<{ id: string; path: string } | null>(null)
export async function downloadCall<T>(promise: Promise<DownloadResult<T>> | undefined): Promise<T> {
  if (!promise) throw new Error('下载功能仅在桌面端可用')
  const result = await promise
  if (!result.ok) throw new Error(result.message)
  return result.value
}
export const downloadError = (error: unknown) =>
  toast({ title: error instanceof Error ? error.message : '下载操作失败', variant: 'destructive' })
export const bytes = (value: number) =>
  value >= 1024 ** 3
    ? `${(value / 1024 ** 3).toFixed(2)} GB`
    : value >= 1024 ** 2
      ? `${(value / 1024 ** 2).toFixed(1)} MB`
      : `${Math.round(value / 1024)} KB`
