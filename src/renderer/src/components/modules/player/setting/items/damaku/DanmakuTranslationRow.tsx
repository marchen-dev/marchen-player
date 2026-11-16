import type { SelectOption } from '@renderer/components/modules/shared/setting/SettingSelect'
import type { TranslationTarget } from '@renderer/services/translation/assets/manifest'
import type { FC } from 'react'
import { LANGUAGE_NATIVE_NAMES } from '@marchen/i18n'
import { usePlayerSettingsValue } from '@renderer/atoms/settings/player'
import { NewBadge } from '@renderer/components/common/NewBadge'
import { FieldLayout } from '@renderer/components/modules/settings/views/Layout'
import { SettingSelect } from '@renderer/components/modules/shared/setting/SettingSelect'
import { useTranslationDownloadConfirm } from '@renderer/components/modules/shared/TranslationDownloadConfirm'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { TRANSLATION_TARGETS } from '@renderer/services/translation/assets/manifest'
import { danmakuTranslation } from '@renderer/services/translation/service'
import { useDanmakuTranslationStatus } from '@renderer/services/translation/status'
import { describeTranslationStatus } from '@renderer/services/translation/status-text'
import { useCallback, useEffect } from 'react'

import { useTranslation } from 'react-i18next'

/** 下拉框里代表「不翻译」的取值 */
const OFF = 'off'

interface DanmakuTranslationRowProps {
  /** 位于播放器侧栏内：使用播放器的深色材质，弹窗挂到播放器容器里（全屏时也可见） */
  playerMaterial: boolean
  portalContainer?: Element | null
}

/**
 * 「弹幕翻译」设置行：选择目标语言的下拉框加一行状态说明。
 * 用下拉框而不是开关，是因为选项本身就写明了翻译成什么语言，以后增加语言只是多一个选项。
 * 下载进度、翻译进度、失败与重试都在这一行内呈现，不用弹窗打断播放；
 * 唯一的弹窗是首次选择某个语言、本机没有对应翻译资源时的下载确认
 * （界面语言就是目标语言时资源会提前下载，不再确认，见 useTranslationDownloadConfirm）。
 */
export const DanmakuTranslationRow: FC<DanmakuTranslationRowProps> = ({
  playerMaterial,
  portalContainer,
}) => {
  const { danmakuTranslation: setting } = usePlayerSettingsValue()
  const status = useDanmakuTranslationStatus()
  const { t } = useTranslation(['danmaku', 'common'])
  // 目标语言用它自己的写法显示（如 English），看不懂当前界面语言的用户也能认出
  const options: SelectOption[] = [
    { label: t('translation.off'), value: OFF },
    ...TRANSLATION_TARGETS.map((target) => ({
      label: LANGUAGE_NATIVE_NAMES[target],
      value: target,
    })),
  ]

  // 首次打开设置时把状态同步到与开关一致（例如启动后开关已是开启）
  useEffect(() => danmakuTranslation.refresh(), [])

  // pending 是正在等待下载确认的那一项，期间下拉框先显示它，取消后回到原来的选项
  const { pending, select, dialog } = useTranslationDownloadConfirm(portalContainer)
  const choose = useCallback(
    (value: string) => select(value === OFF ? null : (value as TranslationTarget)),
    [select],
  )

  const unsupported = status.state === 'unsupported'
  const failed = status.state === 'download_failed' || status.state === 'engine_failed'
  const description = describeTranslationStatus(status)
  const mutedClassName = playerMaterial ? 'text-[var(--player-fg-muted)]' : 'text-muted-foreground'

  return (
    <FieldLayout
      title={
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            {t('translation.title')}
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
            {t('common:action.retry')}
          </Button>
        )}
        <SettingSelect
          playerMaterial={playerMaterial}
          container={portalContainer}
          disabled={unsupported}
          ariaLabel={t('translation.title')}
          groups={options}
          value={unsupported ? OFF : (pending ?? (setting.enabled ? setting.target : OFF))}
          onValueChange={choose}
        />
      </span>
      {dialog}
    </FieldLayout>
  )
}
