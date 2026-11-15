import type { TranslationTarget } from '@renderer/services/translation/assets/manifest'
import type { ReactNode } from 'react'
import { markNewFeatureSeen } from '@renderer/atoms/settings/app'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { getLanguage } from '@renderer/lib/i18n'
import {
  isSaveDataEnabled,
  shouldConfirmTranslationDownload,
  translationTargetForLanguage,
} from '@renderer/services/translation/policy'
import { danmakuTranslation } from '@renderer/services/translation/service'
import { APPROXIMATE_DOWNLOAD_SIZE } from '@renderer/services/translation/status-text'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface TranslationDownloadConfirm {
  /** 正在等待确认的目标语言；没有弹窗时为 null */
  pending: TranslationTarget | null
  /**
   * 选择弹幕翻译的目标语言，null 表示「不翻译」。本机没有翻译资源、又需要用户同意时弹出下载确认；
   * 界面语言就是目标语言时不确认，直接开始下载（省流量模式除外，见 policy.ts）。
   */
  select: (target: TranslationTarget | null) => void
  /** 下载确认弹窗，渲染在调用方的任意位置即可 */
  dialog: ReactNode
}

/**
 * 开启弹幕翻译时的下载确认，设置行与「弹幕加载完成」提示里的询问共用。
 * 确认以 Promise 的形式交给翻译服务：服务等用户选择之后再决定是否下载。
 *
 * @param container 弹窗挂到哪个容器里；播放器内传播放器的容器，全屏时弹窗才可见
 */
export const useTranslationDownloadConfirm = (
  container?: Element | null,
): TranslationDownloadConfirm => {
  const { t } = useTranslation(['danmaku', 'common'])
  const [pending, setPending] = useState<TranslationTarget | null>(null)
  const resolverRef = useRef<((accepted: boolean) => void) | null>(null)

  const settle = useCallback((accepted: boolean) => {
    resolverRef.current?.(accepted)
    resolverRef.current = null
    setPending(null)
  }, [])

  const select = useCallback((target: TranslationTarget | null) => {
    // 选过一次语言就算用过这个功能，「New」标记不再显示
    if (target) markNewFeatureSeen('danmaku-translation')
    const needsConfirm =
      target !== null &&
      shouldConfirmTranslationDownload({
        uiTarget: translationTargetForLanguage(getLanguage()),
        target,
        saveData: isSaveDataEnabled(),
      })
    void danmakuTranslation.select(target, () =>
      needsConfirm
        ? new Promise<boolean>((resolve) => {
            resolverRef.current = resolve
            setPending(target)
          })
        : Promise.resolve(true),
    )
  }, [])

  // 弹窗还开着时调用方被卸载（关闭设置面板、离开播放页）：按取消处理，不留下悬而未决的确认
  useEffect(() => () => resolverRef.current?.(false), [])

  const dialog = (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && settle(false)}>
      <DialogContent container={container} className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{t('translation.confirm.title')}</DialogTitle>
          <DialogDescription className="pt-1 leading-relaxed">
            {t('translation.confirm.description', { size: APPROXIMATE_DOWNLOAD_SIZE })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button variant="outline" onClick={() => settle(false)}>
            {t('common:action.cancel')}
          </Button>
          <Button onClick={() => settle(true)}>{t('translation.confirm.confirm')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { pending, select, dialog }
}
