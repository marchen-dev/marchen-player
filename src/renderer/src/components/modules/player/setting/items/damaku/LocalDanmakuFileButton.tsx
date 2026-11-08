import type { RefObject } from 'react'
import { Button } from '@renderer/components/ui/button'
import { useToast } from '@renderer/components/ui/toast'
import queryClient from '@renderer/lib/query-client'
import { importLocalDanmaku } from '@renderer/services/danmaku/local-import'
import { getPlayerLoadingService } from '@renderer/services/player-loading'
import { useEffect, useRef, useState } from 'react'
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
      const count = result.entry.content.count.toLocaleString('zh-CN')
      toast({
        title: result.skippedCount
          ? `已导入 ${count} 条弹幕，跳过 ${result.skippedCount.toLocaleString('zh-CN')} 条无效或不支持的弹幕`
          : `已导入 ${count} 条弹幕`,
      })
      onImported?.()
    } catch (error) {
      if (!controller.signal.aborted)
        toast({ title: error instanceof Error ? error.message : '导入弹幕失败，请重试' })
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
        aria-label="选择弹幕文件"
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
        {pending ? '正在导入…' : '导入弹幕文件'}
      </Button>
    </>
  )
}
