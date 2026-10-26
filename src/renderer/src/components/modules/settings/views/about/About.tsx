import type { DesktopUpdateState } from '@marchen/shared/types/update'
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

import { SettingsActionRow, SettingsGroup, SettingsPage, SettingsSection } from '../../components'

const copyrightYear = new Date().getFullYear()

export const AboutView = () => {
  const update = useAtomValue(desktopUpdateAtom)
  // deb 等系统包由包管理器替换文件，应用内只提示新版本并引导去下载页。
  const manualUpdate = update?.platform === 'linux-manual'
  const inAppUpdate = update?.platform === 'windows' || update?.platform === 'linux'
  const { mutate, isPending } = useMutation({
    mutationFn: async () => ipcClient?.app.checkUpdate(),
  })

  return (
    <SettingsPage sectionId="about" title="关于" description="Marchen 的版本、更新与反馈渠道">
      <SettingsSection title="Marchen">
        <SettingsGroup>
          <div className="flex min-h-28 items-center justify-between gap-6 p-4">
            <div className="flex min-w-0 items-center gap-4">
              <Logo className="size-16 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-base font-semibold">Marchen Player</h3>
                <p className="mt-1 text-sm text-[var(--settings-muted)]">当前版本 {version}</p>
                <p className="mt-0.5 text-xs text-[var(--settings-muted)]">
                  Copyright © {copyrightYear} Suemor
                </p>
              </div>
            </div>
            {!isWeb && (
              <Button onClick={() => mutate()} disabled={isPending} variant="outline" size="sm">
                {isPending ? '检查中…' : '检查更新'}
              </Button>
            )}
          </div>
        </SettingsGroup>
      </SettingsSection>

      {!isWeb && (inAppUpdate || manualUpdate) && (
        <SettingsSection
          title="软件更新"
          description={
            manualUpdate
              ? '自动检查新版本；当前为系统安装包，请下载新版安装包后覆盖安装。'
              : '自动检查新版本，由你决定下载和安装。'
          }
        >
          <SettingsGroup>
            <div className="space-y-3 p-4">
              <p role="status" aria-live="polite">
                {
                  {
                    idle: '尚未检查更新',
                    checking: '正在检查更新…',
                    upToDate: '当前已是最新版本',
                    available: '发现新版本',
                    downloading: '正在下载更新',
                    preparing: '正在验证并准备更新…',
                    ready: '新版本已准备好',
                    installing: '正在保存进度并安装…',
                    error: '更新失败',
                  }[update.phase]
                }
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
                      下载更新
                    </Button>
                  )}
                {update.phase === 'ready' && (
                  <Button
                    onClick={() => {
                      void ipcClient?.app.installUpdate()
                    }}
                    size="sm"
                  >
                    安装并重启
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
                    前往下载页
                  </Button>
                )}
              </div>
            </div>
          </SettingsGroup>
        </SettingsSection>
      )}

      <SettingsSection title="问题反馈" description="欢迎提交问题、建议或参与项目讨论">
        <SettingsGroup className="mb-3">
          <SettingsActionRow
            label="发送诊断反馈"
            description="附带本机日志，帮助定位播放、字幕或下载问题"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => openFeedbackDialog({ source: 'about' })}
            >
              反馈问题…
            </Button>
          </SettingsActionRow>
          {!isWeb && (
            <SettingsActionRow label="日志位置" description="本地诊断日志，最多保留约 15 MB">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void ipcClient?.app.openLogDirectory()}
              >
                打开目录
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
const formatEta = (seconds: number) =>
  seconds < 60 ? `约 ${Math.max(1, Math.ceil(seconds))} 秒` : `约 ${Math.ceil(seconds / 60)} 分钟`

/**
 * 更新下载进度条，样式与下载页一致；
 * 下载到 100% 后进入 preparing（校验安装包），保持满条并脉冲，提示仍在处理而不是卡住。
 */
const UpdateProgress = ({ update }: { update: DesktopUpdateState }) => {
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
        aria-label="更新下载进度"
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
              ? `${formatBytes(bytesPerSecond)}/s${eta === undefined ? '' : ` · ${formatEta(eta)}`}`
              : '估算中'}
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
