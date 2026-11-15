import type { SelectOption } from '@renderer/components/modules/shared/setting/SettingSelect'
import type { TranslationTarget } from '@renderer/services/translation/assets/manifest'
import type { FC } from 'react'
import { markNewFeatureSeen } from '@renderer/atoms/settings/app'
import { usePlayerSettingsValue } from '@renderer/atoms/settings/player'
import { NewBadge } from '@renderer/components/common/NewBadge'
import { SettingSelect } from '@renderer/components/modules/shared/setting/SettingSelect'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { cn } from '@renderer/lib/utils'
import { translationMessages } from '@renderer/services/translation/messages'
import { danmakuTranslation } from '@renderer/services/translation/service'
import { useDanmakuTranslationStatus } from '@renderer/services/translation/status'
import { useCallback, useEffect, useRef, useState } from 'react'

import { FieldLayout } from '../Layout'

/** 下拉框里代表「不翻译」的取值 */
const OFF = 'off'

const OPTIONS: SelectOption[] = [
  { label: translationMessages.offOption, value: OFF },
  ...Object.entries(translationMessages.targetOptions).map(([value, label]) => ({ label, value })),
]

interface DanmakuTranslationRowProps {
  /** 位于播放器侧栏内：使用播放器的深色材质，弹窗挂到播放器容器里（全屏时也可见） */
  playerMaterial: boolean
  portalContainer?: Element | null
}

/**
 * 「弹幕翻译」设置行：选择目标语言的下拉框加一行状态说明。
 * 用下拉框而不是开关，是因为选项本身就写明了翻译成什么语言，以后增加语言只是多一个选项。
 * 下载进度、翻译进度、失败与重试都在这一行内呈现，不用弹窗打断播放；
 * 唯一的弹窗是首次选择某个语言、本机没有对应翻译资源时的下载确认。
 */
export const DanmakuTranslationRow: FC<DanmakuTranslationRowProps> = ({
  playerMaterial,
  portalContainer,
}) => {
  const { danmakuTranslation: setting } = usePlayerSettingsValue()
  const status = useDanmakuTranslationStatus()

  // 首次打开设置时把状态同步到与开关一致（例如启动后开关已是开启）
  useEffect(() => danmakuTranslation.refresh(), [])

  // 确认弹窗以 Promise 形式交给服务：服务等待用户选择后再决定是否下载。
  // pending 记下正在等待确认的那一项，期间下拉框先显示它，取消后回到原来的选项。
  const [pending, setPending] = useState<TranslationTarget | null>(null)
  const resolverRef = useRef<((accepted: boolean) => void) | null>(null)
  const settle = useCallback((accepted: boolean) => {
    resolverRef.current?.(accepted)
    resolverRef.current = null
    setPending(null)
  }, [])
  const choose = useCallback((value: string) => {
    const target = value === OFF ? null : (value as TranslationTarget)
    // 选过一次语言就算用过这个功能，「New」标记不再显示
    if (target) markNewFeatureSeen('danmaku-translation')
    void danmakuTranslation.select(
      target,
      () =>
        new Promise<boolean>((resolve) => {
          resolverRef.current = resolve
          setPending(target)
        }),
    )
  }, [])
  // 弹窗还开着时这一行被卸载（关闭设置面板）：按取消处理，不留下悬而未决的确认
  useEffect(() => () => resolverRef.current?.(false), [])

  const unsupported = status.state === 'unsupported'
  const failed = status.state === 'download_failed' || status.state === 'engine_failed'
  const description = translationMessages.status(status)
  const mutedClassName = playerMaterial ? 'text-[var(--player-fg-muted)]' : 'text-muted-foreground'

  return (
    <FieldLayout
      title={
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            {translationMessages.settingTitle}
            <NewBadge feature="danmaku-translation" playerMaterial={playerMaterial} />
          </span>
          {description && (
            <span
              // 进度数字持续变化，用等宽数字避免文字左右抖动
              className={cn('text-xs font-normal tabular-nums', mutedClassName)}
              aria-live="polite"
            >
              {description}
            </span>
          )}
        </span>
      }
    >
      <span className="flex shrink-0 items-center gap-2">
        {failed && (
          <Button
            variant="outline"
            size="sm"
            className={
              playerMaterial
                ? 'border-white/11 bg-white/8 text-white hover:bg-white/14 hover:text-white'
                : undefined
            }
            onClick={() => danmakuTranslation.retry()}
          >
            {translationMessages.retry}
          </Button>
        )}
        <SettingSelect
          playerMaterial={playerMaterial}
          container={portalContainer}
          disabled={unsupported}
          ariaLabel={translationMessages.settingTitle}
          groups={OPTIONS}
          value={unsupported ? OFF : (pending ?? (setting.enabled ? setting.target : OFF))}
          onValueChange={choose}
        />
      </span>
      <Dialog open={pending !== null} onOpenChange={(open) => !open && settle(false)}>
        <DialogContent container={portalContainer} className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{translationMessages.confirm.title}</DialogTitle>
            <DialogDescription className="pt-1 leading-relaxed">
              {translationMessages.confirm.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button variant="outline" onClick={() => settle(false)}>
              {translationMessages.confirm.cancel}
            </Button>
            <Button onClick={() => settle(true)}>{translationMessages.confirm.confirm}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FieldLayout>
  )
}
