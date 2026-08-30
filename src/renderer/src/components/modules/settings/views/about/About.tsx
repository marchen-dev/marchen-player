import { version } from '@pkg'
import { Logo } from '@renderer/components/icons/Logo'
import { Button } from '@renderer/components/ui/button'
import { ipcClient } from '@renderer/lib/client'
import { cn, isWeb } from '@renderer/lib/utils'
import { useMutation } from '@tanstack/react-query'

import { SettingsGroup, SettingsPage, SettingsSection } from '../../components'

const copyrightYear = new Date().getFullYear()

export const AboutView = () => {
  const { mutate, isPending } = useMutation({
    mutationFn: async () => ipcClient?.app.checkUpdate(),
  })

  return (
    <SettingsPage sectionId="about" title="关于" description="Marchen 的版本、更新与反馈渠道">
      <SettingsSection title="Marchen">
        <SettingsGroup>
          <div className="flex min-h-28 items-center justify-between gap-6 p-4">
            <div className="flex min-w-0 items-center gap-4">
              <Logo round clasNames={{ wrapper: 'size-16 shrink-0 border' }} />
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

      <SettingsSection title="问题反馈" description="欢迎提交问题、建议或参与项目讨论">
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
