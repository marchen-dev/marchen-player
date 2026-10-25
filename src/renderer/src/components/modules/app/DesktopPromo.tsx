import { Button } from '@renderer/components/ui/button'
import { DESKTOP_DOWNLOAD_URL } from '@renderer/constants'
import { getStorageNS } from '@renderer/lib/ns'
import { usePlayerLoadingSelector } from '@renderer/services/player-loading/hooks'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { AnimatePresence, m } from 'framer-motion'
import { useEffect, useState } from 'react'

const SEEN_KEY = getStorageNS('desktop-promo-seen')
/** 进入页面后稍等再出现，不和首屏加载、拖入视频抢注意力 */
const SHOW_DELAY_MS = 3000

/** 只列网页端做不到的能力，帮用户判断要不要装客户端 */
const ADVANTAGES = [
  { icon: 'icon-[mingcute--server-line]', text: '连接 Jellyfin、Emby、WebDAV，直接浏览播放' },
  { icon: 'icon-[mingcute--link-line]', text: '通过 URL 播放视频直链，下载磁力与 BT 资源' },
  {
    icon: 'icon-[mingcute--folder-open-line]',
    text: '自动发现同目录的字幕和下一集，记录可直接续播',
  },
] as const

const hasSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    // 存储不可用时不打扰用户
    return true
  }
}

const markSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* 存储不可用时本次关闭即可 */
  }
}

/**
 * 网页端首次访问时在右下角推荐桌面客户端，只出现一次。
 *
 * 右下角与播放控制栏重叠，所以只在播放器空闲时出现；展示中开始播放会暂时收起，
 * 退出播放回到空闲后再显示，不算看过。点「下载」或「以后再说」后不再出现。
 */
export const DesktopPromo = () => {
  const idle = usePlayerLoadingSelector((state) => state.step === 'idle')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (open || !idle || hasSeen()) return
    const timer = window.setTimeout(() => {
      setOpen(true)
      captureFeatureUsed('desktop_promo', 'shown')
    }, SHOW_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [idle, open])

  const close = (action: 'download' | 'dismiss') => {
    markSeen()
    setOpen(false)
    captureFeatureUsed('desktop_promo', action)
  }

  return (
    <AnimatePresence>
      {open && idle && (
        <m.aside
          role="dialog"
          aria-labelledby="desktop-promo-title"
          className="bg-popover text-popover-foreground fixed right-6 bottom-6 z-50 w-96 rounded-2xl border p-5 shadow-lg"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            aria-label="关闭"
            className="text-muted-foreground hover:text-foreground absolute top-3 right-3 rounded-md p-1 transition-colors"
            onClick={() => close('dismiss')}
          >
            <i className="icon-[mingcute--close-line] block text-base" aria-hidden="true" />
          </button>
          <h2 id="desktop-promo-title" className="pr-6 font-medium">
            下载桌面客户端
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            macOS、Windows、Linux 均可免费使用，比网页版多出：
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {ADVANTAGES.map((item) => (
              <li key={item.text} className="flex gap-2">
                <i
                  className={`${item.icon} text-muted-foreground mt-0.5 shrink-0 text-base`}
                  aria-hidden="true"
                />
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => close('dismiss')}>
              以后再说
            </Button>
            <Button size="sm" asChild>
              <a
                href={DESKTOP_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
                onClick={() => close('download')}
              >
                <i className="icon-[mingcute--download-2-line] mr-1 text-base" aria-hidden="true" />
                下载客户端
              </a>
            </Button>
          </div>
        </m.aside>
      )}
    </AnimatePresence>
  )
}
