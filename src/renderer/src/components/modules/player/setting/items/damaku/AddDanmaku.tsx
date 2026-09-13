/**
 * 本地弹幕文件导入组件
 *
 * 通过 service.addLocalDanmaku 添加本地弹幕，
 * service 内部会更新播放器渲染和 IndexedDB 缓存。
 */

import type { DB_History } from '@renderer/database/schemas/history'
import { videoAtom } from '@renderer/atoms/player'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { useToast } from '@renderer/components/ui/toast'
import { localDanmakuIdentity, readLocalDanmaku } from '@renderer/lib/local-danmaku'
import queryClient from '@renderer/lib/query-client'
import { getPlayerLoadingService } from '@renderer/services/player-loading/index'
import { useAtomValue } from 'jotai'
import { useRef, useState } from 'react'

import { danmakuSourceQueryKey } from '../../danmaku-source-context'

export const AddDanmaku = () => {
  const { hash } = useAtomValue(videoAtom)
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingRef = useRef(false)
  const [importing, setImporting] = useState(false)

  const handleImportDanmakuFile = async (file: File) => {
    if (pendingRef.current) return
    const service = getPlayerLoadingService()
    const initialState = service.currentState
    if (initialState.step !== 'ready' || initialState.video.hash !== hash) return
    pendingRef.current = true
    setImporting(true)
    try {
      const entry = await readLocalDanmaku(file)
      const state = service.currentState
      // 文件读取期间可能切换视频或重新匹配，避免把结果加到另一个媒体会话。
      if (state.step !== 'ready' || state.video !== initialState.video) return
      if (
        state.danmaku.some(
          (item) => localDanmakuIdentity(item.source) === localDanmakuIdentity(entry.source),
        )
      ) {
        toast({ title: '已经添加过该来源' })
        return
      }
      await service.addLocalDanmaku(entry)
      const updated = service.currentState
      if (updated.step !== 'ready' || updated.video !== initialState.video) return
      queryClient.setQueryData([danmakuSourceQueryKey, hash], (oldData: DB_History) => ({
        ...oldData,
        danmaku: updated.danmaku,
      }))
      toast({ title: '导入成功' })
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : '读取弹幕文件失败，请重试' })
    } finally {
      pendingRef.current = false
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6 pt-1">
      <input
        ref={inputRef}
        type="file"
        accept=".xml,.json"
        className="hidden"
        aria-label="选择弹幕文件"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          // 清空选择值，取消或失败后仍能再次选择同一个文件。
          event.currentTarget.value = ''
          if (file) void handleImportDanmakuFile(file)
        }}
      />
      <div className="flex flex-col gap-3">
        <Label className="text-[var(--player-settings-muted)]">
          从弹幕文件导入，支持 B 站 XML / JSON 格式（最大 10 MB）
        </Label>
        <Button
          size="sm"
          variant="outline"
          className="border-white/11 bg-white/8 text-white hover:bg-white/14 hover:text-white"
          disabled={importing}
          onClick={() => inputRef.current?.click()}
        >
          {importing ? '正在导入…' : '点击导入弹幕文件'}
        </Button>
      </div>
    </div>
  )
}
