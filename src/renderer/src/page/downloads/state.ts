import type { DownloadResult, DownloadSnapshot } from '@marchen/shared/downloads'
import { errorFromFailure, UserError } from '@marchen/shared/errors'
import { toast } from '@renderer/components/ui/toast/use-toast'
import { describeError } from '@renderer/lib/errors'
import { t } from '@renderer/lib/i18n'
import { atom } from 'jotai'
import { createElement } from 'react'
export const downloadsAtom = atom<DownloadSnapshot | null>(null)
export const torrentRequestAtom = atom<{ id: string; path: string } | null>(null)
export async function downloadCall<T>(promise: Promise<DownloadResult<T>> | undefined): Promise<T> {
  if (!promise) throw new UserError('downloads.desktop_only', '下载功能仅在桌面端可用')
  const result = await promise
  if (!result.ok) throw errorFromFailure(result, t('downloads:operationFailed'))
  return result.value
}
export const downloadError = (error: unknown) =>
  toast({
    title: t('downloads:operationFailed'),
    description: createElement('span', null, describeError(error, t('downloads:operationFailed'))),
    variant: 'destructive',
  })
export { formatBytes as bytes } from '@renderer/lib/format-bytes'
