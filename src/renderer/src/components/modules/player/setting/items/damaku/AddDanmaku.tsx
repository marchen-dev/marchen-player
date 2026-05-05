import type { DB_Danmaku, DB_History } from '@renderer/database/schemas/history'
import type { CommentModel } from '@renderer/request/models/comment'
import { videoAtom } from '@renderer/atoms/player'
import { usePlayerSettingsValue } from '@renderer/atoms/settings/player'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { useToast } from '@renderer/components/ui/toast'
import { db } from '@renderer/database/db'
import { ipcClient } from '@renderer/lib/client'
import { mergeDanmaku, parseDanmakuData } from '@renderer/lib/danmaku'
import queryClient from '@renderer/lib/query-client'
import { isWeb } from '@renderer/lib/utils'
import { useAtomValue } from 'jotai'
import { useCallback } from 'react'

import { usePlayerInstance } from '../../../Context'
import { useXgPlayerUtils } from '../../../initialize/hooks'
import { SettingProviderQueryKey, useSettingConfig } from '../../Sheet'

export const AddDanmaku = () => {
  const { hash } = useAtomValue(videoAtom)
  const { toast } = useToast()
  const { danmaku } = useSettingConfig()
  const { danmakuDuration } = usePlayerSettingsValue()
  const player = usePlayerInstance()
  const { setResponsiveSettingsUpdate } = useXgPlayerUtils()

  const addDanmakuToPlayer = useCallback(
    (danmuData?: CommentModel[]) => {
      if (!player) {
        return
      }
      const mergedDanmakuData = mergeDanmaku(danmaku)

      const parsedDanmaku = parseDanmakuData({
        danmuData: [...(mergedDanmakuData ?? []), ...(danmuData ?? [])],
        duration: +danmakuDuration,
      })
      player.danmu?.clear()
      player.danmu?.updateComments(parsedDanmaku, true)
      setResponsiveSettingsUpdate(player)
    },
    [danmaku, danmakuDuration, player, setResponsiveSettingsUpdate],
  )

  // 从本地弹幕文件导入（仅 Electron 环境）
  const handleImportDanmakuFile = useCallback(async () => {
    const danmakuFile = await ipcClient?.player.immportDanmakuFile()
    const danmakuFileData = danmakuFile?.data
    if (!danmakuFile?.ok || !danmakuFileData?.danmaku) {
      danmakuFile?.message && toast({ title: danmakuFile?.message })
      return
    }
    if (!player) {
      return
    }
    const isExisting = danmaku?.some((item) => item.source === danmakuFileData?.source)
    if (isExisting) {
      toast({ title: '已经添加过该来源' })
      return
    }

    addDanmakuToPlayer(danmakuFileData.danmaku)

    const _damaku = [
      ...(danmaku ?? []),
      {
        type: 'local',
        selected: true,
        source: danmakuFileData?.source ?? '',
        content: {
          count: danmakuFileData?.danmaku.length,
          comments: danmakuFileData?.danmaku,
        },
      },
    ] satisfies DB_Danmaku[]

    queryClient.setQueryData([SettingProviderQueryKey, hash], (oldData: DB_History) => ({
      ...oldData,
      danmaku: _damaku,
    }))

    await db.history.update(hash, {
      danmaku: _damaku,
    })

    toast({ title: '导入成功' })
  }, [danmaku, danmakuDuration, hash, player, setResponsiveSettingsUpdate, toast])

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
