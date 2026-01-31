import type { CheckedState } from '@radix-ui/react-checkbox'
import { Separator } from '@radix-ui/react-select'
import { playerSettingSheetAtom, videoAtom } from '@renderer/atoms/player'
import { usePlayerSettingsValue } from '@renderer/atoms/settings/player'
import { jotaiStore } from '@renderer/atoms/store'
import { FieldLayout } from '@renderer/components/modules/settings/views/Layout'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { db } from '@renderer/database/db'
import type { DB_History } from '@renderer/database/schemas/history'
import { useConfirmationDialog } from '@renderer/hooks/use-dialog'
import {
  danmakuPlatformMap,
  mergeDanmaku,
  mostDanmakuPlatform,
  parseDanmakuData,
} from '@renderer/lib/danmaku'
import queryClient from '@renderer/lib/query-client'
import { isWeb } from '@renderer/lib/utils'
import { useAtomValue } from 'jotai'
import { debounce } from 'lodash-es'
import type { FC, PropsWithChildren } from 'react'
import { memo } from 'react'

import { usePlayerInstance } from '../../../Context'
import { useXgPlayerUtils } from '../../../initialize/hooks'
import { showMatchAnimeDialog } from '../../../loading/dialog/hooks'
import { useVideo } from '../../../loading/hooks'
import { SettingProviderQueryKey, useSettingConfig } from '../../Sheet'

export const DanmakuSource = memo(() => {
  const { danmaku } = useSettingConfig()
  return (
    <FieldLayout title="来源">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">{mostDanmakuPlatform(danmaku)}...</Button>
        </PopoverTrigger>
        <PopoverContent className="mx-2 w-80 ">
          <PopoverContentLayout title="来源">
            <SourceList />
            <div className="flex flex-col gap-2.5">
              <RematchDanmaku />
              <ClearDanmakuCache />
            </div>
          </PopoverContentLayout>
          <Separator />
        </PopoverContent>
      </Popover>
    </FieldLayout>
  )
})

const SourceList = memo(() => {
  const { danmakuDuration } = usePlayerSettingsValue()
  const { danmaku } = useSettingConfig()
  const video = useAtomValue(videoAtom)
  const player = usePlayerInstance()
  const { setResponsiveSettingsUpdate } = useXgPlayerUtils()
  const handleCheckDanmaku = debounce((params: { checked: CheckedState; source: string }) => {
    const { checked, source } = params
    if (checked === 'indeterminate') {
      return
    }
    queryClient.setQueryData([SettingProviderQueryKey, video.hash], (oldSetting: DB_History) => {
      const newSetting = oldSetting
      const { danmaku } = newSetting
      danmaku?.forEach((item) => {
        if (item.source === source) {
          item.selected = checked
        }
      })
      if (!danmaku) {
        return
      }
      const mergedDanmakuData = mergeDanmaku(danmaku)

      const parsedDanmaku = parseDanmakuData({
        danmuData: mergedDanmakuData,
        duration: +danmakuDuration,
      })

      if (!player) {
        return
      }
      player.danmu?.clear()

      player.danmu?.updateComments(parsedDanmaku, true)
      setResponsiveSettingsUpdate(player)

      db.history.update(video.hash, {
        danmaku,
      })

      return {
        ...oldSetting,
        newSetting,
      }
    })
  }, 300)
  if (!danmaku) {
    return <p>暂无弹幕</p>
  }
  return danmaku?.map((item) => {
    const danmakuPlatform = danmakuPlatformMap(item)
    return (
      <div key={item.source} className="flex items-center space-x-2">
        <Checkbox
          id={item.source}
          defaultChecked={item.selected}
          onCheckedChange={(checked) => handleCheckDanmaku({ checked, source: item.source })}
        />
        <Label htmlFor={item.source}>
          {danmakuPlatform}
          {item.type === 'third-party-manual' && (
            <Badge className="ml-2 py-0" variant="secondary">
              自定义第三方网址
            </Badge>
          )}
          {item.type === 'local' && (
            <Badge className="ml-2 py-0" variant="secondary">
              本地弹幕文件
            </Badge>
          )}
        </Label>
      </div>
    )
  })
})

interface PopoverContentLayoutProps extends PropsWithChildren {
  title: string
}
export const PopoverContentLayout: FC<PopoverContentLayoutProps> = ({ children, title }) => {
  return (
    <div className="grid gap-4">
      <h4 className="font-medium leading-none">{title}</h4>
      <div className="grid gap-4">{children}</div>
    </div>
  )
}

const RematchDanmaku = () => {
  const video = useAtomValue(videoAtom)
  const player = usePlayerInstance()
  return (
    <Button
      variant="outline"
      onClick={() => {
        player?.pause()
        jotaiStore.set(playerSettingSheetAtom, false)
        showMatchAnimeDialog(true, video.hash)
      }}
    >
      重新匹配弹幕库
    </Button>
  )
}

const ClearDanmakuCache = () => {
  const video = useAtomValue(videoAtom)
  const { importAnimeViaIPC } = useVideo()
  const present = useConfirmationDialog()
  if (isWeb) {
    return null
  }
  return (
    <Button
      variant="outline"
      onClick={async () => {
        present({
          title: '是否清除弹幕缓存? 清除后将重新匹配弹幕库',
          handleConfirm: async () => {
            await db.history.update(video.hash, { danmaku: undefined })
            jotaiStore.set(playerSettingSheetAtom, false)
            importAnimeViaIPC({ path: video.url })
          },
        })
      }}
    >
      清除弹幕缓存
    </Button>
  )
}
