import type { Checkbox as CheckboxPrimitive } from 'radix-ui'
import type { FC, PropsWithChildren } from 'react'
import { hidePlayerSettingsPanel, videoAtom } from '@renderer/atoms/player'
import { FieldLayout } from '@renderer/components/modules/settings/views/Layout'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { db } from '@renderer/database/db'
import { useConfirmationDialog } from '@renderer/hooks/use-dialog'
import { danmakuPlatformMap, mostDanmakuPlatform } from '@renderer/lib/danmaku'
import queryClient from '@renderer/lib/query-client'
import { isWeb } from '@renderer/lib/utils'
import { getPlayerLoadingService } from '@renderer/services/player-loading/index'
import { usePlayerPortalContainer } from '@renderer/services/player-runtime'
import { useAtomValue } from 'jotai'
import { debounce } from 'lodash-es'
import { Select as SelectPrimitive } from 'radix-ui'
import { memo } from 'react'

import { showMatchAnimeDialog } from '../../../loading/dialog/hooks'
import { danmakuSourceQueryKey, useDanmakuSourceConfig } from '../../danmaku-source-context'

export const DanmakuSource = memo(() => {
  const { danmaku } = useDanmakuSourceConfig()
  const portalContainer = usePlayerPortalContainer()
  return (
    <FieldLayout title="来源">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            className="border-white/11 bg-white/8 text-white hover:bg-white/14 hover:text-white"
            variant="outline"
          >
            {mostDanmakuPlatform(danmaku)}...
          </Button>
        </PopoverTrigger>
        <PopoverContent
          container={portalContainer}
          className="mx-2 w-80 border-white/11 bg-[rgb(38_38_44/96%)] text-white shadow-xl"
        >
          <PopoverContentLayout title="来源">
            <SourceList />
            <div className="flex flex-col gap-2.5">
              <RematchDanmaku />
              <ClearDanmakuCache />
            </div>
          </PopoverContentLayout>
          <SelectPrimitive.Separator />
        </PopoverContent>
      </Popover>
    </FieldLayout>
  )
})

const SourceList = memo(() => {
  const { danmaku } = useDanmakuSourceConfig()
  const video = useAtomValue(videoAtom)
  const handleCheckDanmaku = debounce(
    async (params: { checked: CheckboxPrimitive.CheckedState; source: string }) => {
      const { checked, source } = params
      if (checked === 'indeterminate') return

      const service = getPlayerLoadingService()
      await service.setDanmakuSourceSelected(source, checked)
      const state = service.currentState
      if (state.step !== 'ready') return

      queryClient.setQueryData([danmakuSourceQueryKey, video.hash], (oldSetting) => ({
        ...(oldSetting ?? {}),
        danmaku: state.danmaku,
      }))
    },
    300,
  )
  if (!danmaku) {
    return <p>暂无弹幕</p>
  }
  return danmaku?.map((item) => {
    const danmakuPlatform = danmakuPlatformMap(item)
    return (
      <div key={item.source} className="flex items-center space-x-2">
        <Checkbox
          id={item.source}
          checked={item.selected}
          className="border-white/40 bg-white/6 text-white focus-visible:ring-[var(--player-settings-focus)] focus-visible:ring-offset-0 data-[state=checked]:border-[var(--player-settings-accent)] data-[state=checked]:bg-[var(--player-settings-accent)]"
          onCheckedChange={(checked) => handleCheckDanmaku({ checked, source: item.source })}
        />
        <Label htmlFor={item.source}>
          {danmakuPlatform}
          {item.type === 'local' && (
            <Badge className="ml-2 border-0 bg-white/12 py-0 text-white" variant="secondary">
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
      <h4 className="leading-none font-medium">{title}</h4>
      <div className="grid gap-4">{children}</div>
    </div>
  )
}

const RematchDanmaku = () => {
  const video = useAtomValue(videoAtom)
  return (
    <Button
      variant="outline"
      onClick={() => {
        hidePlayerSettingsPanel()
        showMatchAnimeDialog(true, video.hash)
      }}
    >
      重新匹配弹幕库
    </Button>
  )
}

const ClearDanmakuCache = () => {
  const video = useAtomValue(videoAtom)
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
            hidePlayerSettingsPanel()
            // 通过 service 重新加载
            if (video.source?.kind === 'electron-file') {
              getPlayerLoadingService().loadFromPath(video.source.path)
            }
          },
        })
      }}
    >
      清除弹幕缓存
    </Button>
  )
}
