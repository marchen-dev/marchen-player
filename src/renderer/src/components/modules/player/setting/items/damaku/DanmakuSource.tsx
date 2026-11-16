import type { Checkbox as CheckboxPrimitive } from 'radix-ui'
import type { FC, PropsWithChildren } from 'react'
import { hidePlayerSettingsPanel, videoAtom } from '@renderer/atoms/player'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { useToast } from '@renderer/components/ui/toast'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@renderer/components/ui/Tooltip'
import { db } from '@renderer/database/db'
import { useConfirmationDialog } from '@renderer/hooks/use-dialog'
import { danmakuPlatformMap, mostDanmakuPlatform } from '@renderer/lib/danmaku'
import { describeError } from '@renderer/lib/errors'
import queryClient from '@renderer/lib/query-client'
import { isWeb } from '@renderer/lib/utils'
import { getPlayerLoadingService } from '@renderer/services/player-loading/index'
import { usePlayerPortalContainer } from '@renderer/services/player-runtime'
import { useAtomValue } from 'jotai'
import { debounce } from 'lodash-es'
import { Select as SelectPrimitive } from 'radix-ui'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { showMatchAnimeDialog } from '../../../loading/dialog/hooks'
import { danmakuSourceQueryKey, useDanmakuSourceConfig } from '../../danmaku-source-context'
import { EntryRow } from '../../EntryRow'

export const DanmakuSource = memo(() => {
  const { danmaku } = useDanmakuSourceConfig()
  const portalContainer = usePlayerPortalContainer()
  const { t } = useTranslation('danmaku')
  return (
    <Popover>
      <PopoverTrigger asChild>
        <EntryRow
          label={t('source.title')}
          summary={mostDanmakuPlatform(danmaku)}
          summaryTitle={mostDanmakuPlatform(danmaku)}
        />
      </PopoverTrigger>
      <PopoverContent
        container={portalContainer}
        className="bg-player-popover player-glass mx-2 w-80 border-white/11 text-white shadow-xl"
      >
        <PopoverContentLayout title={t('source.title')}>
          <SourceList />
          <div className="flex flex-col gap-2.5">
            <RematchDanmaku />
            <ClearDanmakuCache />
          </div>
        </PopoverContentLayout>
        <SelectPrimitive.Separator />
      </PopoverContent>
    </Popover>
  )
})

const SourceList = memo(() => {
  const { toast } = useToast()
  const { t } = useTranslation('danmaku')
  const portalContainer = usePlayerPortalContainer()
  const { danmaku } = useDanmakuSourceConfig()
  const video = useAtomValue(videoAtom)
  const handleCheckDanmaku = debounce(
    async (params: {
      checked: CheckboxPrimitive.CheckedState
      source: string
      session: number
    }) => {
      const { checked, source } = params
      if (checked === 'indeterminate') return

      const service = getPlayerLoadingService()
      try {
        await service.setDanmakuSourceSelected(source, checked, params.session)
      } catch (error) {
        toast({ title: describeError(error, t('source.saveFailed')) })
        return
      }
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
    return <p>{t('source.empty')}</p>
  }
  return (
    <TooltipProvider delayDuration={250}>
      {danmaku.map((item) => {
        const danmakuPlatform = danmakuPlatformMap(item)
        return (
          <div key={item.source} className="flex min-w-0 items-start gap-2.5">
            <Checkbox
              id={item.source}
              checked={item.selected}
              className="mt-1 shrink-0 border-white/40 bg-white/6 text-white focus-visible:ring-[var(--player-settings-focus)] focus-visible:ring-offset-0 data-[state=checked]:border-[var(--player-settings-accent)] data-[state=checked]:bg-[var(--player-settings-accent)]"
              onCheckedChange={(checked) =>
                handleCheckDanmaku({
                  checked,
                  source: item.source,
                  session: getPlayerLoadingService().sessionId,
                })
              }
            />
            <Label htmlFor={item.source} className="block min-w-0 flex-1 leading-6">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    className="block truncate rounded-sm focus-visible:outline focus-visible:outline-[var(--player-settings-focus)]"
                  >
                    {item.type === 'link' ? item.title : danmakuPlatform}
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  container={portalContainer}
                  side="left"
                  sideOffset={10}
                  className="bg-player-popover player-glass max-w-80 border border-white/11 text-sm leading-6 break-words whitespace-normal text-white shadow-lg"
                >
                  {danmakuPlatform}
                </TooltipContent>
              </Tooltip>
              {item.type !== 'auto' && (
                <span className="mt-1 flex items-center gap-2">
                  <Badge
                    className="shrink-0 border-0 bg-white/12 py-0 leading-5 text-white"
                    variant="secondary"
                  >
                    {item.type === 'link' ? t('source.linkBadge') : t('source.localBadge')}
                  </Badge>
                  {item.type === 'link' && (
                    <span className="text-xs leading-5 font-normal text-white/60">
                      {t('source.itemCount', { total: item.content.count })}
                    </span>
                  )}
                </span>
              )}
            </Label>
          </div>
        )
      })}
    </TooltipProvider>
  )
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

// outline 在播放器深色色板下是近黑实底，与毛玻璃弹层割裂；改用面板内统一的半透明白底
const sourceActionClass = 'border-white/11 bg-white/8 text-white hover:bg-white/14 hover:text-white'

const RematchDanmaku = () => {
  const video = useAtomValue(videoAtom)
  const { t } = useTranslation('danmaku')
  return (
    <Button
      variant="outline"
      className={sourceActionClass}
      onClick={() => {
        hidePlayerSettingsPanel()
        showMatchAnimeDialog(true, video.hash)
      }}
    >
      {t('source.rematch')}
    </Button>
  )
}

const ClearDanmakuCache = () => {
  const video = useAtomValue(videoAtom)
  const present = useConfirmationDialog()
  const { t } = useTranslation('danmaku')
  if (isWeb) {
    return null
  }
  return (
    <Button
      variant="outline"
      className={sourceActionClass}
      onClick={async () => {
        present({
          title: t('source.clearCacheConfirm'),
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
      {t('source.clearCache')}
    </Button>
  )
}
