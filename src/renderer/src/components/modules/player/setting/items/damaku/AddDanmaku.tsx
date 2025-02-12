import { videoAtom } from '@renderer/atoms/player'
import { usePlayerSettingsValue } from '@renderer/atoms/settings/player'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { useToast } from '@renderer/components/ui/toast'
import { db } from '@renderer/database/db'
import type { DB_Danmaku, DB_History } from '@renderer/database/schemas/history'
import { tipcClient } from '@renderer/lib/client'
import { parseDanmakuData } from '@renderer/lib/danmaku'
import queryClient from '@renderer/lib/query-client'
import { isWeb } from '@renderer/lib/utils'
import { apiClient } from '@renderer/request'
import type { CommentModel } from '@renderer/request/models/comment'
import { useMutation } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import type { FormEvent } from 'react'
import { useCallback, useRef } from 'react'
import { z } from 'zod'

import { usePlayerInstance } from '../../../Context'
import { useXgPlayerUtils } from '../../../initialize/hooks'
import { SettingProviderQueryKey, useSettingConfig } from '../../Sheet'

export const AddDanmaku = () => {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { hash } = useAtomValue(videoAtom)
  const { toast } = useToast()
  const { danmaku } = useSettingConfig()
  const { danmakuDuration } = usePlayerSettingsValue()
  const player = usePlayerInstance()
  const { setResponsiveSettingsUpdate } = useXgPlayerUtils()
  const { mutate, isPending } = useMutation({
    mutationFn: async (url: string) => {
      const matchedDanmaku = await apiClient.comment.getExtcomment({ url })
      if (!matchedDanmaku?.count) {
        toast({ title: '没有找到弹幕' })
        return
      }
      if (!player) {
        return
      }
      addDanmakuToPlayer(matchedDanmaku.comments)

      const _damaku = [
        ...(danmaku ?? []),
        { type: 'third-party-manual', selected: true, source: url, content: matchedDanmaku },
      ] satisfies DB_Danmaku[]

      queryClient.setQueryData([SettingProviderQueryKey, hash], (oldData: DB_History) => ({
        ...oldData,
        danmaku: _damaku,
      }))

      await db.history.update(hash, {
        danmaku: _damaku,
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

  const addDanmakuToPlayer = useCallback(
    (danmuData?: CommentModel[]) => {
      if (!player) {
        return
      }
      const oldDanmaku = player.danmu?.config.comments

      const parsedDanmaku = parseDanmakuData({
        danmuData,
        duration: +danmakuDuration,
      })

      const mergedDanmakus = [...(oldDanmaku || []), ...(parsedDanmaku || [])]
      player.danmu?.clear()

      player.danmu?.updateComments(mergedDanmakus, true)
      setResponsiveSettingsUpdate(player)
    },
    [danmakuDuration, player, setResponsiveSettingsUpdate],
  )

  const handleImportDanmakuFile = useCallback(async () => {
    const danmakuFile = await tipcClient?.immportDanmakuFile()
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

    toast({
      title: `导入成功`,
    })
  }, [danmaku, danmakuDuration, hash, player, setResponsiveSettingsUpdate, toast])
  return (
    <div className="space-y-6 pt-1">
      <form className="mt-1 flex flex-col gap-3" onSubmit={handleOnSubmit}>
        <Label htmlFor="width" className="text-zinc-600">
          从第三方网址导入弹幕
        </Label>
        <Input
          id="width"
          disabled={isPending}
          ref={inputRef}
          placeholder="https:// 按回车完成输入"
        />
      </form>
      {!isWeb && (
        <div className="flex flex-col gap-3">
          <Label htmlFor="width" className="text-zinc-600">
            从弹幕文件导入，支持 XML 格式
          </Label>
          <Button size="sm" variant="outline" onClick={handleImportDanmakuFile}>
            点击导入弹幕文件
          </Button>
        </div>
      )}
    </div>
  )
}
