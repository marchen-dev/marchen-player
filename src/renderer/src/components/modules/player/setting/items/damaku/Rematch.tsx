import type { CheckedState } from '@radix-ui/react-checkbox'
import { videoAtom } from '@renderer/atoms/player'
import { usePlayerSettingsValue } from '@renderer/atoms/settings/player'
import { FieldLayout } from '@renderer/components/modules/settings/views/Layout'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { useToast } from '@renderer/components/ui/toast'
import { db } from '@renderer/database/db'
import type { DB_History } from '@renderer/database/schemas/history'
import {
  danmakuPlatformMap,
  mergeDanmaku,
  mostDanmakuPlatform,
  parseDanmakuData,
} from '@renderer/lib/danmaku'
import queryClient from '@renderer/lib/query-client'
import { apiClient } from '@renderer/request'
import { useAtomValue } from 'jotai'
import { debounce } from 'lodash-es'
import type { FC, PropsWithChildren } from 'react'
import { memo, useCallback, useRef } from 'react'

import { usePlayerInstance } from '../../../Context'
import { useXgPlayerUtils } from '../../../initialize/hooks'
import { SettingProviderQueryKey, useSettingConfig } from '../../Sheet'

export const Rematch = memo(() => {
  const { danmaku } = useSettingConfig()
  return (
    <FieldLayout title="来源">
      <Popover open>
        <PopoverTrigger asChild>
          <Button variant="outline">{mostDanmakuPlatform(danmaku)}...</Button>
        </PopoverTrigger>
        <PopoverContent className="mx-2 w-80 space-y-7">
          <PopoverContentLayout title="来源">
            <SourceList />
          </PopoverContentLayout>
          <PopoverContentLayout title="手动添加">
            <InputSource />
          </PopoverContentLayout>
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
  return danmaku?.map((item) => {
    const danmakuPlatform = danmakuPlatformMap(item)
    return (
      <div key={item.source} className="flex items-center space-x-2">
        <Checkbox
          id={item.source}
          defaultChecked={item.selected}
          onCheckedChange={(checked) => handleCheckDanmaku({ checked, source: item.source })}
        />
        <Label htmlFor={item.source}>{danmakuPlatform}</Label>
      </div>
    )
  })
})

export const InputSource = () => {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { hash } = useAtomValue(videoAtom)
  const { toast } = useToast()
  const { danmaku } = useSettingConfig()
  const handleOnSubmit = useCallback(async () => {
    if (!inputRef.current?.value) {
      toast({ title: '请输入第三方网址' })
      return
    }
    const matchedDanmaku = await apiClient.comment.getExtcomment({ url: inputRef.current.value })
    if (!matchedDanmaku?.count) {
      toast({ title: '没有找到弹幕' })
      return
    }

    danmaku?.push({
      type: 'third-party-manual',
      selected:true,
      source: inputRef.current.value,
      content: matchedDanmaku,
    })

    db.history.update(hash, {
      danmaku,
    })
    toast({ title: '添加成功' })
    inputRef.current.value = ''
  }, [toast])
  return (
    <form className="grid grid-cols-3 items-center gap-4" onSubmit={handleOnSubmit}>
      <Label htmlFor="width">第三方网址</Label>
      <Input
        id="width"
        ref={inputRef}
        placeholder="https:// 按回车完成输入"
        className="col-span-2 h-8"
      />
    </form>
  )
}

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
