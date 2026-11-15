import { useAppSettings } from '@renderer/atoms/settings/app'
import { usePlayerSettings } from '@renderer/atoms/settings/player'
import { ApiRouteSetting } from '@renderer/components/modules/shared/setting/ApiRouteSetting'
import {
  PlayerEngineDescription,
  PlayerEngineSelect,
  usePlayerEngineSetting,
} from '@renderer/components/modules/shared/setting/PlayerEngineSetting'
import { SettingSwitch } from '@renderer/components/modules/shared/setting/SettingSwitch'
import { Button } from '@renderer/components/ui/button'
import { useToast } from '@renderer/components/ui/toast'
import { useConfirmationDialog } from '@renderer/hooks/use-dialog'
import { ipcClient } from '@renderer/lib/client'
import { formatBytes } from '@renderer/lib/format-bytes'
import { resetApp } from '@renderer/lib/ns'
import { isWeb } from '@renderer/lib/utils'
import {
  clearAutoDanmakuCache,
  clearThumbnails,
  clearTranslationAssets,
  useStorageUsage,
} from '@renderer/services/storage'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { reportOperationalError } from '@renderer/services/telemetry/operational-errors'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  SettingsActionRow,
  SettingsGroup,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from '../../components'
import { DarkModeToggle } from './DarkMode'
import { LanguageSetting } from './Language'

export const GeneralView = () => {
  const [appSettings, setAppSettings] = useAppSettings()
  const [playerSettings, setPlayerSettings] = usePlayerSettings()
  const { toast } = useToast()
  // 第一个命名空间的键直接写；通用词在 common 里，写成 `common:键`
  const { t } = useTranslation(['settings', 'common'])
  const showConfirmationDialog = useConfirmationDialog()

  const { state: usage, refresh: refreshUsage } = useStorageUsage()
  // 正在执行的清除项，执行期间禁用对应按钮防止重复点击
  const [clearing, setClearing] = useState<ClearTarget | null>(null)

  const runClear = useCallback(
    async (target: ClearTarget) => {
      const { action, run } = CLEAR_ACTIONS[target]
      setClearing(target)
      try {
        await run()
        captureFeatureUsed('settings', action)
        toast({ title: t(`general.data.items.${target}.cleared`) })
      } catch (error) {
        reportOperationalError(target === 'network' ? 'ipc' : 'player', `settings.${action}`, error)
        toast({ title: t(`general.data.items.${target}.failed`), variant: 'destructive' })
      } finally {
        setClearing(null)
        void refreshUsage()
      }
    },
    [refreshUsage, t, toast],
  )

  // 各清除项的可释放大小；undefined 表示统计中、失败或当前平台不支持
  const sizes: Record<ClearTarget, number | undefined> =
    usage.status === 'ready'
      ? {
          danmaku: usage.history?.danmaku.bytes,
          thumbnail: usage.history?.thumbnail.bytes,
          network: usage.network,
          translation: usage.translation,
        }
      : { danmaku: undefined, thumbnail: undefined, network: undefined, translation: undefined }

  return (
    <SettingsPage
      sectionId="general"
      title={t('tabs.general.label')}
      description={t('tabs.general.description')}
    >
      {!isWeb && (
        <SettingsSection title={t('general.app.title')}>
          <SettingsGroup>
            <SettingsRow
              label={t('general.app.launchAtLogin.label')}
              description={t('general.app.launchAtLogin.description')}
              labelId="launch-at-login-label"
              descriptionId="launch-at-login-description"
            >
              <SettingSwitch
                value={appSettings.launchAtLogin}
                aria-labelledby="launch-at-login-label"
                aria-describedby="launch-at-login-description"
                onCheckedChange={async (checked) => {
                  await ipcClient?.app.windowAction({ action: 'laungh-at-login', checked })
                  setAppSettings((prev) => ({ ...prev, launchAtLogin: checked }))
                }}
              />
            </SettingsRow>
          </SettingsGroup>
        </SettingsSection>
      )}

      <SettingsSection title={t('general.appearance.title')}>
        <SettingsGroup>
          <SettingsRow
            label={t('general.appearance.theme.label')}
            description={t('general.appearance.theme.description')}
            labelId="theme-preference-label"
          >
            <div aria-labelledby="theme-preference-label">
              <DarkModeToggle />
            </div>
          </SettingsRow>
          <LanguageSetting />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title={t('general.playback.title')}>
        <SettingsGroup>
          <PlayerEngineRow />
          {/* 只影响之后打开的视频，加载开始时读取一次 */}
          <SettingsRow
            label={t('general.playback.playFirst.label')}
            description={t('general.playback.playFirst.description')}
            labelId="play-first-label"
            descriptionId="play-first-description"
          >
            <SettingSwitch
              value={playerSettings.enablePlayFirst}
              aria-labelledby="play-first-label"
              aria-describedby="play-first-description"
              onCheckedChange={(checked) => {
                captureFeatureUsed('play_first', checked ? 'enable' : 'disable')
                setPlayerSettings((prev) => ({ ...prev, enablePlayFirst: checked }))
              }}
            />
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title={t('general.network.title')}>
        <SettingsGroup>
          <ApiRouteSetting />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title={t('general.data.title')}>
        <SettingsGroup>
          {CLEAR_TARGETS.filter((target) => !isWeb || target !== 'network').map((target) => (
            <SettingsActionRow
              key={target}
              label={t(`general.data.items.${target}.label`)}
              description={t(`general.data.items.${target}.description`)}
            >
              <span className="text-muted-foreground mr-3 text-xs tabular-nums">
                {usage.status === 'loading'
                  ? t('general.data.calculating')
                  : sizes[target] != null &&
                    t('general.data.size', { size: formatBytes(sizes[target]) })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={clearing != null || sizes[target] === 0}
                onClick={() => runClear(target)}
              >
                {t('common:action.clear')}
              </Button>
            </SettingsActionRow>
          ))}
          <SettingsActionRow
            label={t('general.data.reset.label')}
            description={t('general.data.reset.description')}
            danger
          >
            <Button
              variant="destructive"
              size="sm"
              onClick={() =>
                showConfirmationDialog({
                  title: t('general.data.reset.confirm'),
                  handleConfirm: resetApp,
                })
              }
            >
              {t('general.data.reset.label')}
            </Button>
          </SettingsActionRow>
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  )
}

type ClearTarget = 'danmaku' | 'thumbnail' | 'network' | 'translation'

const CLEAR_TARGETS: ClearTarget[] = ['danmaku', 'thumbnail', 'network', 'translation']

/**
 * 各缓存类清除项：埋点 action 与执行函数。行标题、说明与结果提示在渲染时按清除项取
 * settings 命名空间下的 `general.data.items.<清除项>`，不放在这个模块顶层的常量里。
 * 弹幕缓存只清自动匹配弹幕，本地导入与外链弹幕保留（见 services/storage）。
 */
const CLEAR_ACTIONS: Record<ClearTarget, { action: string; run: () => Promise<void> }> = {
  danmaku: {
    action: 'clear_danmaku_cache',
    run: clearAutoDanmakuCache,
  },
  thumbnail: {
    action: 'clear_thumbnails',
    run: clearThumbnails,
  },
  network: {
    action: 'clear_network_cache',
    run: async () => {
      await ipcClient?.app.clearNetworkCache()
    },
  },
  translation: {
    action: 'clear_translation_assets',
    run: clearTranslationAssets,
  },
}

/** 「播放内核」使用与其他设置行相同的排版：标题与状态说明在左，下拉框在右 */
const PlayerEngineRow = () => {
  const state = usePlayerEngineSetting()
  const { t } = useTranslation('settings')
  return (
    <SettingsRow
      label={t('playerEngine.label')}
      description={<PlayerEngineDescription state={state} />}
      labelId="player-engine-label"
      descriptionId="player-engine-description"
    >
      <PlayerEngineSelect state={state} ariaLabel={t('playerEngine.label')} />
    </SettingsRow>
  )
}
