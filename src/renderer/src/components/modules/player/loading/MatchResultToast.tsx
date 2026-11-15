import type { LoadingState } from '@marchen/player-loading'
import type { TranslationTarget } from '@renderer/services/translation/assets/manifest'
import { LANGUAGE_NATIVE_NAMES } from '@marchen/i18n'
import { showPlayerSettingsPanel } from '@renderer/atoms/player'
import {
  appSettingAtom,
  markTranslationPromptAnswered,
  setTranslationPreloadOptOut,
} from '@renderer/atoms/settings/app'
import { playerSettingAtom } from '@renderer/atoms/settings/player'
import { jotaiStore } from '@renderer/atoms/store'
import { useTranslationDownloadConfirm } from '@renderer/components/modules/shared/TranslationDownloadConfirm'
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@renderer/components/ui/toast/toast'
import { TRANSLATION_ASSETS_BASE } from '@renderer/lib/env'
import { CONTENT_LANG, formatNumber, getLanguage, t } from '@renderer/lib/i18n'
import { usePlayerLoadingService } from '@renderer/services/player-loading/hooks'
import { getMatchInfo } from '@renderer/services/player-loading/match-info'
import { usePlayerPortalContainer } from '@renderer/services/player-runtime'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import {
  shouldAskDanmakuTranslation,
  translationTargetForLanguage,
} from '@renderer/services/translation/policy'
import {
  browserSupportEnvironment,
  detectUnsupportedReason,
} from '@renderer/services/translation/support'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { showMatchAnimeDialog } from './dialog/hooks'

type Notice = ReturnType<typeof getMatchInfo> & {
  id: number
  open: boolean
  automatic: boolean
  hash: string
  /**
   * 这条提示里顺带问一次「要不要把弹幕翻译成界面语言」，值是要翻译成的语言。
   * 问的这一次，原有的「查看」操作让位给「翻译 / 不用」。
   */
  translateTo: TranslationTarget | null
}

/** 普通提示停留 5 秒；带翻译询问的要读一句话并做决定，停留 12 秒 */
const NOTICE_DURATION = 5_000
const PROMPT_DURATION = 12_000

/**
 * 翻译询问在一次应用运行里最多出现一次：提示自行消失而用户没有选择时，
 * 下次启动可以再问，但不在同一次运行里反复打扰。
 */
let translationAskedThisRun = false

/**
 * 刚刚带着翻译询问出现的那条提示属于哪个视频、何时出现。
 * 同一个视频的提示可能在很短时间内出现两次（播放器在开播时重新挂载，或匹配结果与弹幕数量
 * 先后更新，后一条替换前一条），询问跟着最新的一条走，不因为被替换而丢失，也不算第二次询问。
 * 放在模块里而不是组件的 ref 里：重新挂载后是一个新的组件实例。
 */
let recentPrompt: { hash: string; at: number } | null = null
/** 超过这个时间再出现的提示是另一回事（例如重新匹配），不再延续上一条的询问 */
const PROMPT_CONTINUE_MS = 3_000
const isContinuingPrompt = (hash: string): boolean =>
  recentPrompt?.hash === hash && performance.now() - recentPrompt.at < PROMPT_CONTINUE_MS

/**
 * 这条提示是否顺带询问翻译；条件见 policy.ts 的 shouldAskDanmakuTranslation。
 * continuing 为真表示它接替的是同一个视频刚刚还带着询问的那条提示，不算新的一次询问。
 */
const resolveTranslationPrompt = (
  info: ReturnType<typeof getMatchInfo>,
  continuing: boolean,
): TranslationTarget | null => {
  const uiTarget = translationTargetForLanguage(getLanguage())
  // 简体中文界面在这里就结束，不做后面的环境检测
  if (!uiTarget) return null
  const ask = shouldAskDanmakuTranslation({
    uiTarget,
    supported: detectUnsupportedReason(browserSupportEnvironment(TRANSLATION_ASSETS_BASE)) === null,
    prompt: jotaiStore.get(appSettingAtom).danmakuTranslationPrompt,
    translationEnabled: jotaiStore.get(playerSettingAtom).danmakuTranslation.enabled,
    askedThisRun: translationAskedThisRun && !continuing,
    loaded: info.matched && !info.failed && !info.unmatched && !info.matchFailed,
    count: info.count,
  })
  return ask ? uiTarget : null
}

const getNoticeTitle = (notice: Notice) => {
  if (notice.unmatched) return t('player:matchToast.title.unmatched')
  if (notice.matchFailed) return t('player:matchToast.title.matchFailed')
  if (notice.failed) {
    if (notice.recoveryFailed) return t('player:matchToast.title.updateFailed')
    // 已有可用的在线弹幕时只是刷新失败，例如新番缓存过期后后台更新未成功
    return notice.count > 0
      ? t('player:matchToast.title.updateFailed')
      : t('player:matchToast.title.loadFailed')
  }
  return notice.automatic
    ? t('player:matchToast.title.automatic')
    : t('player:matchToast.title.updated')
}

/** 挂载在播放器内，Web 全屏时 Toast 仍位于全屏元素之下。 */
export const MatchResultToast = () => {
  const service = usePlayerLoadingService()
  const [notice, setNotice] = useState<Notice | null>(null)
  // 订阅语言变化；标题用模块级的 t 按调用时的语言求值
  const { t } = useTranslation('player')
  // 询问里点「翻译」后的下载确认：只有省流量模式下才会出现，挂在播放器容器里（全屏时可见）
  const portalContainer = usePlayerPortalContainer()
  const { select: selectTranslation, dialog: translationConfirm } =
    useTranslationDownloadConfirm(portalContainer)

  useEffect(() => {
    let previous: LoadingState | undefined
    let sequence = 0
    const subscription = service.state$.subscribe((state) => {
      const before = previous
      previous = state
      if (state.step !== 'ready') {
        setNotice(null)
        return
      }
      // 优先播放的后台阶段尚未结束时不提示，结束时（含沿用同一匹配的刷新）再通知
      if (state.background) return
      const settled = before?.step === 'ready' && Boolean(before.background)
      // 只通知加载/重新匹配的完成，切换来源或导入本地弹幕不重复弹出。
      if (before?.step === 'ready' && before.match === state.match && !settled) return
      // 选集弹窗「稍后选择」或失败页直接播放时，用户刚看过结论，开播后不再重复提示
      if (
        !settled &&
        (state.playNowFrom === 'waiting_user' || state.playNowFrom === 'match_failed')
      )
        return
      const info = getMatchInfo(state)
      if (
        (!info.matched && !info.failed && !info.unmatched && !info.matchFailed) ||
        (state.matchOrigin === 'history' && !info.failed && before?.step !== 'reloading')
      )
        return
      const continuing = isContinuingPrompt(state.video.hash)
      const translateTo = resolveTranslationPrompt(info, continuing)
      if (translateTo && !continuing) {
        translationAskedThisRun = true
        recentPrompt = { hash: state.video.hash, at: performance.now() }
        captureFeatureUsed('danmaku_translation', 'prompt_shown', translateTo)
      }
      setNotice({
        ...info,
        id: ++sequence,
        open: true,
        automatic: state.matchOrigin === 'auto',
        hash: state.video.hash,
        translateTo,
      })
    })
    return () => subscription.unsubscribe()
  }, [service])

  return (
    // 每条通知独立计时，避免上条通知移除时遗留悬停/焦点暂停状态。
    <ToastProvider
      key={notice?.id}
      duration={notice?.translateTo ? PROMPT_DURATION : NOTICE_DURATION}
    >
      {notice && (
        <Toast
          key={notice.id}
          data-player-match-toast
          open={notice.open}
          onOpenChange={(open) => {
            // 提示关闭（用户做了选择、手动关掉或自行消失）：这次询问到此结束
            if (!open) recentPrompt = null
            setNotice((current) => (current ? { ...current, open } : null))
          }}
          className="no-drag-region bg-player-popover player-glass gap-3 space-x-0 border-white/15 p-4 pr-8 text-white shadow-xl"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <ToastTitle>{getNoticeTitle(notice)}</ToastTitle>
            <ToastDescription className="space-y-1 text-white/70">
              <span className="block truncate" title={notice.title} lang={CONTENT_LANG}>
                {notice.title}
              </span>
              {notice.episode && (
                <span className="block truncate" title={notice.episode} lang={CONTENT_LANG}>
                  {notice.episode}
                </span>
              )}
              <span className="block">
                {notice.unmatched
                  ? t('matchToast.hint.unmatched')
                  : notice.failed || notice.matchFailed
                    ? t('matchToast.hint.playable')
                    : t('matchToast.hint.loaded', { total: formatNumber(notice.count) })}
              </span>
              {notice.translateTo && (
                <span className="block text-white">
                  {t('matchToast.translate.question', {
                    language: LANGUAGE_NATIVE_NAMES[notice.translateTo],
                  })}
                </span>
              )}
            </ToastDescription>
          </div>
          {notice.translateTo ? (
            <TranslationPromptActions target={notice.translateTo} onAccept={selectTranslation} />
          ) : (
            <ToastAction
              altText={
                notice.unmatched
                  ? t('matchToast.actionAlt.unmatched')
                  : notice.matchFailed
                    ? t('matchToast.actionAlt.matchFailed')
                    : notice.failed
                      ? t('matchToast.actionAlt.failed')
                      : t('matchToast.actionAlt.view')
              }
              className="border-white/20 text-white hover:bg-white/10 hover:text-white"
              onClick={() => {
                if (notice.unmatched) showMatchAnimeDialog(true, notice.hash)
                else if (notice.matchFailed) service.retryMatch()
                else if (notice.failed && notice.canRetry) service.retryDanmaku()
                else showPlayerSettingsPanel('danmaku')
              }}
            >
              {notice.unmatched
                ? t('matchToast.action.unmatched')
                : notice.matchFailed
                  ? t('matchToast.action.matchFailed')
                  : notice.failed && notice.canRetry
                    ? t('matchToast.action.failed')
                    : t('matchToast.action.view')}
            </ToastAction>
          )}
          <ToastClose
            aria-label={t('matchToast.close')}
            className="text-white/60 hover:text-white"
          />
        </Toast>
      )}
      <ToastViewport
        aria-label={t('matchToast.viewportLabel')}
        className="absolute top-auto right-0 bottom-0 max-w-[420px] sm:bottom-0"
      />
      {translationConfirm}
    </ToastProvider>
  )
}

/** 翻译询问的两个操作；点任意一个都算用户做过选择，之后不再询问 */
const TranslationPromptActions = ({
  target,
  onAccept,
}: {
  target: TranslationTarget
  onAccept: (target: TranslationTarget) => void
}) => {
  const { t } = useTranslation('player')
  const language = LANGUAGE_NATIVE_NAMES[target]
  const actionClassName = 'border-white/20 text-white hover:bg-white/10 hover:text-white'
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <ToastAction
        altText={t('matchToast.translate.acceptAlt', { language })}
        className={actionClassName}
        onClick={() => {
          captureFeatureUsed('danmaku_translation', 'prompt_accept', target)
          // 与在设置里选择目标语言走同一条路径：记为已选择、清掉预下载的退出标记、开启翻译
          onAccept(target)
        }}
      >
        {t('matchToast.translate.accept')}
      </ToastAction>
      <ToastAction
        altText={t('matchToast.translate.declineAlt')}
        className={actionClassName}
        onClick={() => {
          captureFeatureUsed('danmaku_translation', 'prompt_decline', target)
          markTranslationPromptAnswered()
          // 不想翻译的用户也不需要翻译资源：尚未下载的不再自动下载，已下载的保留
          setTranslationPreloadOptOut(true)
        }}
      >
        {t('matchToast.translate.decline')}
      </ToastAction>
    </div>
  )
}
