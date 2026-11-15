import type { DesktopUpdateState } from '@marchen/shared/types/update'
import type { TFunction } from 'i18next'
import { version } from '@pkg'
import { openFeedbackDialog } from '@renderer/atoms/feedback'
import { desktopUpdateAtom } from '@renderer/atoms/progress'
import { Logo } from '@renderer/components/icons/Logo'
import { Button } from '@renderer/components/ui/button'
import { ipcClient } from '@renderer/lib/client'
import { formatBytes } from '@renderer/lib/format-bytes'
import { cn, isWeb } from '@renderer/lib/utils'
import { useMutation } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'

import { SettingsActionRow, SettingsGroup, SettingsPage, SettingsSection } from '../../components'

const copyrightYear = new Date().getFullYear()

export const AboutView = () => {
  const { t } = useTranslation('settings')
  const update = useAtomValue(desktopUpdateAtom)
  // deb 等系统包由包管理器替换文件，应用内只提示新版本并引导去下载页。
  const manualUpdate = update?.platform === 'linux-manual'
  const inAppUpdate = update?.platform === 'windows' || update?.platform === 'linux'
  const { mutate, isPending } = useMutation({
    mutationFn: async () => ipcClient?.app.checkUpdate(),
  })

  return (
    <SettingsPage
      sectionId="about"
      title={t('tabs.about.label')}
      description={t('about.description')}
    >
      <SettingsSection title="Marchen">
        <SettingsGroup>
          <div className="flex min-h-28 items-center justify-between gap-6 p-4">
            <div className="flex min-w-0 items-center gap-4">
              <Logo className="size-16 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-base font-semibold">Marchen Player</h3>
                <p className="mt-1 text-sm text-[var(--settings-muted)]">
                  {t('about.currentVersion', { version })}
                </p>
                <p className="mt-0.5 text-xs text-[var(--settings-muted)]">
                  Copyright © {copyrightYear} Suemor
                </p>
              </div>
            </div>
            {!isWeb && (
              <Button onClick={() => mutate()} disabled={isPending} variant="outline" size="sm">
                {isPending ? t('about.checking') : t('about.checkUpdate')}
              </Button>
            )}
          </div>
        </SettingsGroup>
      </SettingsSection>

      {!isWeb && (inAppUpdate || manualUpdate) && (
        <SettingsSection
          title={t('about.update.title')}
          description={
            manualUpdate ? t('about.update.descriptionManual') : t('about.update.descriptionInApp')
          }
        >
          <SettingsGroup>
            <div className="space-y-3 p-4">
              <p role="status" aria-live="polite">
                {t(`about.update.phase.${update.phase}`)}
                {update.version ? ` · ${update.version}` : ''}
              </p>
              {update.notes && (
                <p className="text-sm whitespace-pre-wrap text-[var(--settings-muted)]">
                  {update.notes}
                </p>
              )}
              {(update.phase === 'downloading' || update.phase === 'preparing') && (
                <UpdateProgress update={update} />
              )}
              {update.error && (
                <p role="alert" className="text-sm">
                  {update.error}
                </p>
              )}
              <div className="flex gap-2">
                {inAppUpdate &&
                  (update.phase === 'available' ||
                    (update.phase === 'error' && update.version)) && (
                    <Button
                      onClick={() => {
                        void ipcClient?.app.downloadUpdate()
                      }}
                      size="sm"
                    >
                      {t('about.update.download')}
                    </Button>
                  )}
                {update.phase === 'ready' && (
                  <Button
                    onClick={() => {
                      void ipcClient?.app.installUpdate()
                    }}
                    size="sm"
                  >
                    {t('about.update.install')}
                  </Button>
                )}
                {(update.phase === 'error' || (manualUpdate && update.phase === 'available')) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      void ipcClient?.app.openUpdateDownload()
                    }}
                    size="sm"
                  >
                    {t('about.update.openDownloadPage')}
                  </Button>
                )}
              </div>
            </div>
          </SettingsGroup>
        </SettingsSection>
      )}

      <SettingsSection
        title={t('about.feedback.title')}
        description={t('about.feedback.description')}
      >
        <SettingsGroup className="mb-3">
          <SettingsActionRow
            label={t('about.feedback.diagnostic.label')}
            description={t('about.feedback.diagnostic.description')}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => openFeedbackDialog({ source: 'about' })}
            >
              {t('about.feedback.diagnostic.action')}
            </Button>
          </SettingsActionRow>
          {!isWeb && (
            <SettingsActionRow
              label={t('about.feedback.logs.label')}
              description={t('about.feedback.logs.description')}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => void ipcClient?.app.openLogDirectory()}
              >
                {t('about.feedback.logs.action')}
              </Button>
            </SettingsActionRow>
          )}
        </SettingsGroup>
        <div className="grid grid-cols-2 gap-2">
          {socialMediaList.map((item) => (
            <Button variant="outline" key={item.name} className="justify-start" size="sm" asChild>
              <a href={item.link} target="_blank" rel="noreferrer">
                <i className={cn(item.icon, 'mr-2 text-lg')} aria-hidden="true" />
                {item.name}
              </a>
            </Button>
          ))}
        </div>
      </SettingsSection>
    </SettingsPage>
  )
}

/** 剩余时间按秒估算，不足一分钟显示秒，避免小安装包一直显示「约 1 分钟」 */
const formatEta = (seconds: number, t: TFunction<'settings'>) =>
  seconds < 60
    ? t('about.update.etaSeconds', { count: Math.max(1, Math.ceil(seconds)) })
    : t('about.update.etaMinutes', { count: Math.ceil(seconds / 60) })

/**
 * 更新下载进度条，样式与下载页一致；
 * 下载到 100% 后进入 preparing（校验安装包），保持满条并脉冲，提示仍在处理而不是卡住。
 */
const UpdateProgress = ({ update }: { update: DesktopUpdateState }) => {
  const { t } = useTranslation('settings')
  const preparing = update.phase === 'preparing'
  const percent = preparing ? 100 : Math.floor(update.percent ?? 0)
  const { transferred, total, bytesPerSecond } = update
  const eta =
    total && transferred !== undefined && bytesPerSecond
      ? (total - transferred) / bytesPerSecond
      : undefined
  return (
    <div className="space-y-1.5">
      <div
        role="progressbar"
        aria-label={t('about.update.progressLabel')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="bg-muted h-1.5 overflow-hidden rounded-full"
      >
        <div
          className={cn(
            'bg-primary h-full rounded-full transition-[width] duration-300 ease-out',
            preparing && 'animate-pulse',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between gap-4 text-xs text-[var(--settings-muted)] tabular-nums">
        <span>
          {total ? `${formatBytes(transferred ?? 0)} / ${formatBytes(total)} · ` : ''}
          {percent}%
        </span>
        {!preparing && (
          <span>
            {bytesPerSecond
              ? `${formatBytes(bytesPerSecond)}/s${eta === undefined ? '' : ` · ${formatEta(eta, t)}`}`
              : t('about.update.estimating')}
          </span>
        )}
      </div>
    </div>
  )
}

const socialMediaList = [
  {
    icon: 'icon-[mingcute--github-fill]',
    name: 'GitHub',
    link: 'https://github.com/marchen-dev/marchen-player',
  },
  {
    icon: 'icon-[mingcute--social-x-fill]',
    name: 'X',
    link: 'https://x.com/Suemor233',
  },
  {
    icon: 'icon-[mingcute--mail-fill]',
    name: 'Email',
    link: 'mailto:suemor233@outlook.com',
  },
  {
    icon: 'icon-[mingcute--telegram-fill]',
    name: 'Telegram',
    link: 'https://t.me/Suemor',
  },
]
