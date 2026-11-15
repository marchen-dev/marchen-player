/**
 * 翻译资源预下载的触发时机。
 *
 * 界面语言有对应的翻译模型时（目前是 English），不等用户开启翻译就在后台把引擎与模型下载好，
 * 这样第一次点「翻译」立即生效。什么情况下该下由 policy.ts 的 shouldPreloadTranslation 决定，
 * 怎么下由 service.ts 的 preload 负责，这里只管「什么时候试一次」：
 *
 * - 启动时界面语言已经确定之后；
 * - 界面语言切换之后；
 * - Web 端：本次运行里第一次打开视频之后（网页可能只是被随手打开，不在进入页面时就下约 50 MB）。
 *
 * 每次都放到应用空闲时再做，不与首屏渲染和视频加载争抢。
 */
import { appSettingAtom } from '@renderer/atoms/settings/app'
import { jotaiStore } from '@renderer/atoms/store'
import { TRANSLATION_ASSETS_BASE } from '@renderer/lib/env'
import { getLanguage, i18n } from '@renderer/lib/i18n'
import { isWeb } from '@renderer/lib/utils'
import { getPlayerLoadingService } from '@renderer/services/player-loading/index'
import { isSaveDataEnabled, shouldPreloadTranslation, translationTargetForLanguage } from './policy'
import { danmakuTranslation } from './service'
import { browserSupportEnvironment, detectUnsupportedReason } from './support'

/** 本次运行里是否打开过视频；只记在内存里，下次启动要重新等到打开视频 */
let openedVideo = false
let scheduled = false
let started = false

/** 除「本机是否缺资源」之外的条件；那一项要查本机存储，单独异步读取 */
const readConditions = () => ({
  uiTarget: translationTargetForLanguage(getLanguage()),
  supported: detectUnsupportedReason(browserSupportEnvironment(TRANSLATION_ASSETS_BASE)) === null,
  optOut: jotaiStore.get(appSettingAtom).translationPreloadOptOut,
  saveData: isSaveDataEnabled(),
  isWeb,
  openedVideo,
})

const attempt = async (): Promise<void> => {
  const before = readConditions()
  const target = before.uiTarget
  // 先用不需要读存储的条件筛一遍：简体中文界面在这里就结束，不碰本机存储
  if (!target || !shouldPreloadTranslation({ ...before, assetsMissing: true })) return
  const assetsMissing = await danmakuTranslation.hasMissingAssets(target)
  // 查询期间条件可能已经变化（切回中文、清除了模型）
  const now = readConditions()
  if (now.uiTarget !== target || !shouldPreloadTranslation({ ...now, assetsMissing })) return
  await danmakuTranslation.preload(target)
}

const whenIdle = (task: () => void): void => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(task, { timeout: 10_000 })
  else setTimeout(task, 2_000)
}

/** 在应用空闲时检查一次是否需要预下载；重复调用会合并成一次 */
export const scheduleTranslationPreload = (): void => {
  if (scheduled) return
  scheduled = true
  whenIdle(() => {
    scheduled = false
    // 预下载失败不打扰用户，下次触发时再试；下载本身的失败已在 service 里记入遥测
    void attempt().catch((error: unknown) => {
      console.warn('[translation] 预下载检查失败', error)
    })
  })
}

/** 应用挂载后调用一次：登记触发时机并做首次检查 */
export const startTranslationPreload = (): void => {
  if (started) return
  started = true
  i18n.on('languageChanged', scheduleTranslationPreload)
  scheduleTranslationPreload()
  if (!isWeb) return
  // Web 端：播放加载状态机第一次离开空闲状态，说明用户确实打开了视频
  const subscription = getPlayerLoadingService().state$.subscribe((state) => {
    if (state.step === 'idle' || openedVideo) return
    openedVideo = true
    // 订阅回调可能在 subscribe 返回之前同步触发，延后一拍再退订
    queueMicrotask(() => subscription.unsubscribe())
    scheduleTranslationPreload()
  })
}
