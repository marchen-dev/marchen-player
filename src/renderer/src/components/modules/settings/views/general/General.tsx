import { useAppSettings } from '@renderer/atoms/settings/app'
import { ApiRouteSetting } from '@renderer/components/modules/shared/setting/ApiRouteSetting'
import { PlayerEngineSetting } from '@renderer/components/modules/shared/setting/PlayerEngineSetting'
import { SettingSwitch } from '@renderer/components/modules/shared/setting/SettingSwitch'
import { Button } from '@renderer/components/ui/button'
import { useToast } from '@renderer/components/ui/toast'
import { useConfirmationDialog } from '@renderer/hooks/use-dialog'
import { ipcClient } from '@renderer/lib/client'
import { formatBytes } from '@renderer/lib/format-bytes'
import { resetApp } from '@renderer/lib/ns'
import { isWeb } from '@renderer/lib/utils'
import { clearAutoDanmakuCache, clearThumbnails, useStorageUsage } from '@renderer/services/storage'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { reportOperationalError } from '@renderer/services/telemetry/operational-errors'
import { useCallback, useState } from 'react'

import {
  SettingsActionRow,
  SettingsGroup,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from '../../components'
import { DarkModeToggle } from './DarkMode'

export const GeneralView = () => {
  const [appSettings, setAppSettings] = useAppSettings()
  const { toast } = useToast()
  const showConfirmationDialog = useConfirmationDialog()

  const { state: usage, refresh: refreshUsage } = useStorageUsage()
  // 正在执行的清除项，执行期间禁用对应按钮防止重复点击
  const [clearing, setClearing] = useState<ClearTarget | null>(null)

  const runClear = useCallback(
    async (target: ClearTarget) => {
      const { label, action, run } = CLEAR_ACTIONS[target]
      setClearing(target)
      try {
        await run()
        captureFeatureUsed('settings', action)
        toast({ title: `已清除${label}` })
      } catch (error) {
        reportOperationalError(target === 'network' ? 'ipc' : 'player', `settings.${action}`, error)
        toast({ title: `清除${label}失败`, variant: 'destructive' })
      } finally {
        setClearing(null)
        void refreshUsage()
      }
    },
    [refreshUsage, toast],
  )

  // 各清除项的可释放大小；undefined 表示统计中、失败或当前平台不支持
  const sizes: Record<ClearTarget, number | undefined> =
    usage.status === 'ready'
      ? {
          danmaku: usage.history?.danmaku.bytes,
          thumbnail: usage.history?.thumbnail.bytes,
          network: usage.network,
        }
      : { danmaku: undefined, thumbnail: undefined, network: undefined }

  return (
    <SettingsPage sectionId="general" title="通用" description="管理应用行为、外观与本地数据">
      {!isWeb && (
        <SettingsSection title="应用">
          <SettingsGroup>
            <SettingsRow
              label="开机自启"
              description="登录系统后自动启动 Marchen"
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

      <SettingsSection title="外观">
        <SettingsGroup>
          <SettingsRow
            label="主题"
            description="跟随系统，或固定使用白天与夜间外观"
            labelId="theme-preference-label"
          >
            <div aria-labelledby="theme-preference-label">
              <DarkModeToggle />
            </div>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="播放">
        <SettingsGroup>
          <div className="p-4">
            <PlayerEngineSetting />
          </div>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="网络">
        <SettingsGroup>
          <div className="p-4">
            <ApiRouteSetting />
          </div>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="数据">
        <SettingsGroup>
          {CLEAR_TARGETS.filter((target) => !isWeb || target !== 'network').map((target) => (
            <SettingsActionRow
              key={target}
              label={CLEAR_ACTIONS[target].label}
              description={CLEAR_ACTIONS[target].description}
            >
              <span className="text-muted-foreground mr-3 text-xs tabular-nums">
                {usage.status === 'loading'
                  ? '计算中…'
                  : sizes[target] != null && `约 ${formatBytes(sizes[target])}`}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={clearing != null || sizes[target] === 0}
                onClick={() => runClear(target)}
              >
                清除
              </Button>
            </SettingsActionRow>
          ))}
          <SettingsActionRow
            label="重置应用"
            description="清除任务、记录与设置，保留视频文件"
            danger
          >
            <Button
              variant="destructive"
              size="sm"
              onClick={() =>
                showConfirmationDialog({
                  title: '确定重置应用？此操作无法撤销。',
                  handleConfirm: resetApp,
                })
              }
            >
              重置应用
            </Button>
          </SettingsActionRow>
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  )
}

type ClearTarget = 'danmaku' | 'thumbnail' | 'network'

const CLEAR_TARGETS: ClearTarget[] = ['danmaku', 'thumbnail', 'network']

/**
 * 各缓存类清除项：行标题、埋点 action 与执行函数。
 * 弹幕缓存只清自动匹配弹幕，本地导入与外链弹幕保留（见 services/storage）。
 */
const CLEAR_ACTIONS: Record<
  ClearTarget,
  { label: string; description: string; action: string; run: () => Promise<void> }
> = {
  danmaku: {
    label: '弹幕缓存',
    description: '下次播放时重新获取，导入的弹幕会保留',
    action: 'clear_danmaku_cache',
    run: clearAutoDanmakuCache,
  },
  thumbnail: {
    label: '播放缩略图',
    description: '继续观看改用作品海报',
    action: 'clear_thumbnails',
    run: clearThumbnails,
  },
  network: {
    label: '网络缓存',
    description: '海报等图片，需要时重新下载',
    action: 'clear_network_cache',
    run: async () => {
      await ipcClient?.app.clearNetworkCache()
    },
  },
}
