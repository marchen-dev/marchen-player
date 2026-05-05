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
import { ipcClient } from '@renderer/lib/client'
import queryClient from '@renderer/lib/query-client'
import { isWeb } from '@renderer/lib/utils'
import { getPlayerLoadingService } from '@renderer/services/player-loading/index'
import { useAtomValue } from 'jotai'
import { useCallback } from 'react'

import { SettingProviderQueryKey, useSettingConfig } from '../../Sheet'

export const AddDanmaku = () => {
  const { hash } = useAtomValue(videoAtom)
  const { toast } = useToast()
  const { danmaku } = useSettingConfig()

  // 从本地弹幕文件导入（仅 Electron 环境）
  const handleImportDanmakuFile = useCallback(async () => {
    const danmakuFile = await ipcClient?.player.immportDanmakuFile()
    const danmakuFileData = danmakuFile?.data
    if (!danmakuFile?.ok || !danmakuFileData?.danmaku) {
      danmakuFile?.message && toast({ title: danmakuFile?.message })
      return
    }

    const isExisting = danmaku?.some((item) => item.source === danmakuFileData?.source)
    if (isExisting) {
      toast({ title: '已经添加过该来源' })
      return
    }

    // 通过 service 添加本地弹幕（会自动更新播放器和缓存）
    const service = getPlayerLoadingService()
    await service.addLocalDanmaku({
      type: 'local',
      selected: true,
      source: danmakuFileData?.source ?? '',
      content: {
        count: danmakuFileData?.danmaku.length,
        comments: danmakuFileData?.danmaku,
      },
    })

    // 更新设置面板的 UI 缓存
    queryClient.setQueryData([SettingProviderQueryKey, hash], (oldData: DB_History) => ({
      ...oldData,
      danmaku: service.currentState.step === 'playing' ? (service.currentState as any).danmaku : oldData?.danmaku,
    }))

    toast({ title: '导入成功' })
  }, [danmaku, hash, toast])

  if (isWeb) {
    return null
  }

  return (
    <div className="space-y-6 pt-1">
      <div className="flex flex-col gap-3">
        <Label className="text-zinc-600">从弹幕文件导入，支持 XML 和 JSON 格式</Label>
        <Button size="sm" variant="outline" onClick={handleImportDanmakuFile}>
          点击导入弹幕文件
        </Button>
      </div>
    </div>
  )
}
