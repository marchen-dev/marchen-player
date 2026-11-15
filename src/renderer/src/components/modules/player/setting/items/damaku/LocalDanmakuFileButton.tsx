import type { RefObject } from 'react'
import { Button } from '@renderer/components/ui/button'
import { useToast } from '@renderer/components/ui/toast'
import { describeError } from '@renderer/lib/errors'
import { formatNumber } from '@renderer/lib/i18n'
import queryClient from '@renderer/lib/query-client'
import { importLocalDanmaku } from '@renderer/services/danmaku/local-import'
import { getPlayerLoadingService } from '@renderer/services/player-loading'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { danmakuSourceQueryKey } from '../../danmaku-source-context'

/** 两处入口共享选择、取消和结果反馈；active 防止关闭弹窗后的迟到读取提交。 */
export function LocalDanmakuFileButton({
  active = true,
  onImported,
  onPendingChange,
  cancelRef,
  className,
}: {
  cancelRef?: RefObject<(() => void) | null>
  active?: boolean
  onImported?: () => void
  onPendingChange?: (pending: boolean) => void
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(false)
  const [pending, setPending] = useState(false)
  const { toast } = useToast()
  const { t } = useTranslation('danmaku')
  useEffect(() => {
    mountedRef.current = true
    if (cancelRef) cancelRef.current = () => pendingRef.current?.abort()
    return () => {
      mountedRef.current = false
      pendingRef.current?.abort()
      if (cancelRef) cancelRef.current = null
      onPendingChange?.(false)
    }
  }, [cancelRef, onPendingChange])
  useEffect(() => {
    if (!active) pendingRef.current?.abort()
  }, [active])

  const importFile = async (file: File) => {
    if (pendingRef.current || !active) return
    const controller = new AbortController()
    pendingRef.current = controller
    setPending(true)
    onPendingChange?.(true)
    try {
      const result = await importLocalDanmaku(file, getPlayerLoadingService(), controller.signal)
      if (!result) return
      void queryClient.invalidateQueries({ queryKey: [danmakuSourceQueryKey, result.hash] })
      const count = formatNumber(result.entry.content.count)
      toast({
        title: result.skippedCount
          ? t('localImport.importedSkipped', {
              total: count,
              skipped: formatNumber(result.skippedCount),
            })
          : t('localImport.imported', { total: count }),
      })
      onImported?.()
    } catch (error) {
      if (!controller.signal.aborted)
        // 文件校验与「已添加过」的错误码是裸的（invalid_format、duplicate 等），归到 localDanmaku 域
        toast({ title: describeError(error, t('localImport.failed'), { domain: 'localDanmaku' }) })
    } finally {
      pendingRef.current = null
      if (mountedRef.current) {
        setPending(false)
        onPendingChange?.(false)
      }
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xml,.json"
        className="hidden"
        aria-label={t('localImport.chooseFile')}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void importFile(file)
        }}
      />
      <Button
        size="sm"
        variant="outline"
        className={className}
        disabled={pending || !active}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? t('localImport.importing') : t('localImport.import')}
      </Button>
    </>
  )
}
