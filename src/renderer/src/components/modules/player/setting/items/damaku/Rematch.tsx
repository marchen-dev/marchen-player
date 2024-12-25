import type { CheckedState } from '@radix-ui/react-checkbox'
import { Separator } from '@radix-ui/react-select'
import { videoAtom } from '@renderer/atoms/player'
import { usePlayerSettingsValue } from '@renderer/atoms/settings/player'
import { FieldLayout } from '@renderer/components/modules/settings/views/Layout'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { useToast } from '@renderer/components/ui/toast'
import { db } from '@renderer/database/db'
import type { DB_History } from '@renderer/database/schemas/history'
import { tipcClient } from '@renderer/lib/client'
import {
  danmakuPlatformMap,
  mergeDanmaku,
  mostDanmakuPlatform,
  parseDanmakuData,
} from '@renderer/lib/danmaku'
import queryClient from '@renderer/lib/query-client'
import { apiClient } from '@renderer/request'
import { useMutation } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { debounce } from 'lodash-es'
import type { FC, FormEvent, PropsWithChildren } from 'react'
import { memo, useCallback, useRef } from 'react'
import { z } from 'zod'

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
          <Separator />
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
        <Label htmlFor={item.source}>
          {danmakuPlatform}
          {item.type === 'third-party-manual' && (
            <Badge className="ml-2 py-0" variant="secondary">
              手动添加
            </Badge>
          )}
        </Label>
      </div>
    )
  })
})

export const InputSource = () => {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { hash } = useAtomValue(videoAtom)
  const { toast } = useToast()
  const { danmaku } = useSettingConfig()
  const { danmakuDuration } = usePlayerSettingsValue()
  const player = usePlayerInstance()
  const { setResponsiveDanmakuConfig } = useXgPlayerUtils()
  const { mutate, isPending } = useMutation({
    mutationFn: async (url: string) => {
      const matchedDanmaku = await apiClient.comment.getExtcomment({ url })
      if (!matchedDanmaku?.count) {
        toast({ title: '没有找到弹幕' })
        return
      }

      danmaku?.push({
        type: 'third-party-manual',
        selected: true,
        source: url,
        content: matchedDanmaku,
      })

      db.history.update(hash, {
        danmaku,
      })
      toast({ title: '添加成功' })
    },
    onError: (error) => {
      toast({ title: error.message })
    },
  })
  const handleOnSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const inputValue = inputRef.current?.value
      if (!inputValue) {
        toast({ title: '请输入第三方网址' })
        return
      }

      const isEmail = z.string().url().safeParse(inputValue)
      if (!isEmail.success) {
        toast({ title: '请输入正确的网址' })
        return
      }
      const existingSource = danmaku?.some((item) => item.source === inputValue)
      if (existingSource) {
        toast({ title: '已经添加过该来源' })
        clearInput()
        return
      }
      mutate(inputValue)
      clearInput()
    },
    [danmaku, mutate],
  )

  const clearInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }, [])

  const handleImportDanmakuFile = useCallback(async () => {
    const bilibiliDanmakuData = await tipcClient?.immportDanmakuFile({ duration: +danmakuDuration })
    if (!bilibiliDanmakuData?.ok) {
      toast({ title: bilibiliDanmakuData?.message })
      return
    }
    if (!player) {
      return
    }
    const oldDanmaku = player.danmu?.config.comments

    const mergedDanmakus = [...(oldDanmaku || []), ...(bilibiliDanmakuData.data || [])]
    player.danmu?.clear()

    player.danmu?.updateComments(mergedDanmakus, true)
    setResponsiveDanmakuConfig(player)

    toast({
      title: `导入成功`,
    })
  }, [])
  return (
    <>
      <form className="mt-1 flex flex-col gap-3" onSubmit={handleOnSubmit}>
        <Label htmlFor="width" className="text-zinc-600">
          第三方网址
        </Label>
        <Input
          id="width"
          disabled={isPending}
          ref={inputRef}
          placeholder="https:// 按回车完成输入"
        />
      </form>
      <Label htmlFor="width" className="text-zinc-600">
        xml 弹幕文件
      </Label>
      <Button size="sm" variant="outline" onClick={handleImportDanmakuFile}>
        点击导入弹幕文件
      </Button>
    </>
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
