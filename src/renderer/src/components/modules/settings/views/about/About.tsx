import { version } from '@pkg'
import { Logo } from '@renderer/components/icons/Logo'
import { Button } from '@renderer/components/ui/button'
import { useToast } from '@renderer/components/ui/toast'
import { db } from '@renderer/database/db'
import { useConfirmationDialog } from '@renderer/hooks/use-dialog'
import { tipcClient } from '@renderer/lib/client'
import { resetApp } from '@renderer/lib/ns'
import { cn, isWeb } from '@renderer/lib/utils'
import { useMutation } from '@tanstack/react-query'
import { useCallback } from 'react'

import { FieldsCardLayout, SettingViewContainer } from '../Layout'

export const AboutView = () => {
  const { toast } = useToast()
  const showConfirmationDialog = useConfirmationDialog()

  const { mutate, isPending } = useMutation({
    mutationFn: async () => tipcClient?.checkUpdate(),
  })

  const handleClearDanmakuCache = useCallback(async () => {
    try {
      await db.transaction('rw', db.history, async () => {
        const allEntries = await db.history.toArray()
        for (const entry of allEntries) {
          await db.history.update(entry.hash, { danmaku: undefined })
        }
      })
      toast({
        title: '清除弹幕缓存成功',
      })
    } catch (error) {
      console.error('Failed to clear danmaku field:', error)
      toast({
        title: '清除弹幕缓存失败',
        variant: 'destructive',
      })
    }
  }, [toast])
  return (
    <SettingViewContainer>
      <FieldsCardLayout className="bg-zinc-50 dark:bg-zinc-900">
        <div className="m-3 flex items-center justify-between">
          <div className="flex gap-3">
            <Logo round clasNames={{ wrapper: 'size-20 border' }} />
            <div className="flex flex-col gap-1">
              <h4 className="text-lg font-medium">Marchen</h4>
              <div className="text-sm text-zinc-500">
                <p>当前版本: {version}</p>
                <p>Copyright @ {new Date().getFullYear()} Suemor</p>
              </div>
            </div>
          </div>
          {!isWeb && (
            <Button onClick={() => mutate()} disabled={isPending} variant="outline">
              检查更新
            </Button>
          )}
        </div>
      </FieldsCardLayout>

      <FieldsCardLayout title="问题反馈">
        <div className="grid grid-cols-4 gap-3">
          {SocialMediaList.map((item) => (
            <Button variant="outline" key={item.name} className="cursor-default" size="sm" asChild>
              <a href={item.link} target="_blank" rel="noreferrer" className="cursor-default">
                <i className={cn(item.icon, 'mr-1 text-lg')} />
                {item.name}
              </a>
            </Button>
          ))}
        </div>
      </FieldsCardLayout>

      <FieldsCardLayout title="缓存数据">
        <div className="grid grid-cols-4 gap-3">
          <Button variant="outline" size="sm" onClick={handleClearDanmakuCache}>
            <i className="icon-[mingcute--delete-2-line] mr-1 text-lg" />
            清除弹幕缓存
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (isWeb) {
                showConfirmationDialog({
                  title: '重置应用?',
                  handleConfirm: resetApp,
                })
                return
              }
              resetApp()
            }}
          >
            <i className="icon-[mingcute--alert-line] mr-1 text-lg" />
            重置应用
          </Button>
        </div>
      </FieldsCardLayout>
    </SettingViewContainer>
  )
}

const SocialMediaList = [
  {
    icon: 'icon-[mingcute--github-fill]',
    name: 'Github',
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
