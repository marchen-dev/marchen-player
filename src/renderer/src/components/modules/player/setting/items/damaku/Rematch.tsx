import type { CheckedState } from '@radix-ui/react-checkbox'
import { videoAtom } from '@renderer/atoms/player'
import { usePlayerSettingsValue } from '@renderer/atoms/settings/player'
import { FieldLayout } from '@renderer/components/modules/settings/views/Layout'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { db } from '@renderer/database/db'
import type { DB_History } from '@renderer/database/schemas/history'
import {
  danmakuPlatformMap,
  mergeDanmaku,
  mostDanmakuPlatform,
  parseDanmakuData,
} from '@renderer/lib/danmaku'
import queryClient from '@renderer/lib/query-client'
import { useAtomValue } from 'jotai'
import { debounce } from 'lodash-es'
import type { FC, PropsWithChildren } from 'react'
import { memo } from 'react'

import { usePlayerInstance } from '../../../Context'
import { useXgPlayerUtils } from '../../../initialize/hooks'
import { SettingProviderQueryKey, useSettingConfig } from '../../Sheet'

export const Rematch = memo(() => {
  const { danmakuDuration } = usePlayerSettingsValue()
  const video = useAtomValue(videoAtom)
  const player = usePlayerInstance()
  const { danmaku } = useSettingConfig()
  const { setResponsiveDanmakuConfig } = useXgPlayerUtils()
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
      setResponsiveDanmakuConfig(player)

      db.history.update(video.hash, {
        danmaku,
      })

      return {
        ...oldSetting,
        newSetting,
      }
    })
  }, 300)
  return (
    <FieldLayout title="来源">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">{mostDanmakuPlatform(danmaku)}...</Button>
        </PopoverTrigger>
        <PopoverContent className="mx-2 w-80">
          <div className="space-y-7">
            <PopoverContentLayout title="来源">
              {danmaku?.map((item) => {
                const danmakuPlatform = danmakuPlatformMap(item)
                return (
                  <div key={item.source} className="flex items-center space-x-2">
                    <Checkbox
                      id={item.source}
                      defaultChecked={item.selected}
                      onCheckedChange={(checked) =>
                        handleCheckDanmaku({ checked, source: item.source })
                      }
                    />
                    <Label htmlFor={item.source}>{danmakuPlatform}</Label>
                  </div>
                )
              })}
            </PopoverContentLayout>

            <PopoverContentLayout title="手动添加">
              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor="width">第三方网址</Label>
                <Input id="width" defaultValue="100%" className="col-span-2 h-8" />
              </div>
            </PopoverContentLayout>
          </div>
        </PopoverContent>
      </Popover>
    </FieldLayout>
  )
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
