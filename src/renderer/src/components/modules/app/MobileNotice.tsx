import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { useToast } from '@renderer/components/ui/toast'
import { getStorageNS } from '@renderer/lib/ns'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const CONTINUED_KEY = getStorageNS('mobile-notice-continued')

const hasContinued = () => {
  try {
    return localStorage.getItem(CONTINUED_KEY) === '1'
  } catch {
    // 存储不可用时每次都提示，手机上未适配的界面比多一次弹窗更影响体验
    return false
  }
}

const markContinued = () => {
  try {
    localStorage.setItem(CONTINUED_KEY, '1')
  } catch {
    /* 存储不可用时本次关闭即可 */
  }
}

/**
 * 手机访问网页版时的提示弹窗。
 *
 * 产品只适配桌面端，打开即提示用户改用电脑；可分享链接转到电脑，也可「仍要继续」。
 * 只有选择继续（含点关闭、遮罩、Esc）才记住不再出现；仅分享不算，用户可能还会回来。
 * 这是全站唯一按窄屏布局的界面。
 */
export const MobileNotice = () => {
  const [open, setOpen] = useState(() => !hasContinued())
  const { t } = useTranslation(['app', 'common'])
  const { toast } = useToast()

  const dismiss = () => {
    markContinued()
    setOpen(false)
  }

  // 分享站点根地址即可，hash 路由对电脑端没有意义
  const share = async () => {
    const url = window.location.origin
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Marchen Player', url })
        return
      } catch (error) {
        // 用户取消分享面板是预期行为，不再退回复制
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      toast({
        title: t('mobileNotice.copiedTitle'),
        description: t('mobileNotice.copiedDescription'),
      })
    } catch {
      toast({ title: t('common:copyFailed'), description: url, variant: 'destructive' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm gap-5 p-5">
        <DialogHeader className="items-center gap-2 text-center sm:text-center">
          <i
            className="icon-[mingcute--computer-line] text-muted-foreground text-4xl"
            aria-hidden="true"
          />
          <DialogTitle>{t('mobileNotice.title')}</DialogTitle>
          <DialogDescription className="leading-relaxed">
            {t('mobileNotice.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button onClick={share}>
            <i className="icon-[mingcute--share-forward-line] mr-1 text-base" aria-hidden="true" />
            {t('mobileNotice.share')}
          </Button>
          <Button variant="ghost" onClick={dismiss}>
            {t('mobileNotice.continue')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
