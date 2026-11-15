/**
 * 弹幕翻译的编排：把「设置开关、资源下载、引擎生命周期、调度」串起来。
 *
 * 状态由三件事决定：开关是否开启、本机资源是否齐全、是否有播放会话在用弹幕。
 * 任何一项变化都调用 reconcile，由它把系统带到与当前条件一致的状态；
 * 期间用 epoch 识别过期的异步步骤，避免旧流程在条件变化后继续生效。
 *
 * - 引擎只在开关开启、资源就绪且播放页确有需要翻译的弹幕时才加载，
 *   关闭翻译、离开播放页或清除资源时立即终止 Worker，释放几百 MB 内存。
 * - 引擎出错后不自动重启（避免崩溃循环），弹幕回退原文；用户重新开关或点重试才再试。
 * - 遥测调用失败不影响这里的流程：telemetry 封装内部已自行降级。
 */
import type { TranslationAssetFile, TranslationTarget } from './assets/manifest'
import type { TranslatableItem } from './schedule'
import type { DanmakuTranslationSettings } from './settings'
import { playerSettingAtom } from '@renderer/atoms/settings/player'
import { jotaiStore } from '@renderer/atoms/store'
import { TRANSLATION_ASSETS_BASE } from '@renderer/lib/env'
import { telemetry } from '@renderer/services/telemetry/client'
import { captureFeatureUsed } from '@renderer/services/telemetry/features'
import { reportOperationalError } from '@renderer/services/telemetry/operational-errors'
import {
  ensureTranslationAssets,
  findMissingAssets,
  isAssetAbort,
  TranslationAssetError,
} from './assets/download'
import {
  listTranslationAssets,
  totalAssetSize,
  TRANSLATION_PAIRS,
  translationPairId,
} from './assets/manifest'
import { opfsAssetStore } from './assets/store'
import { isTranslatorDisposed, TranslatorClient, TranslatorError } from './engine/client'
import { needsTranslation, TranslationScheduler } from './schedule'
import { getDanmakuTranslationStatus, setDanmakuTranslationStatus } from './status'
import { browserSupportEnvironment, detectUnsupportedReason } from './support'
import { translationStore } from './translation-store'

type AssetTrigger = 'first_enable' | 'auto_recover' | 'retry'

/** 播放页提供的会话：目前只需要当前播放位置 */
export interface TranslationSession {
  now: () => number
}

const EMPTY_IDS: ReadonlySet<string> = new Set()

class DanmakuTranslationService {
  private session: TranslationSession | null = null
  private items: readonly TranslatableItem[] = []
  private blockedIds: ReadonlySet<string> = EMPTY_IDS
  private client: TranslatorClient | null = null
  private scheduler: TranslationScheduler | null = null
  private engineStartMs = 0
  /** 引擎出错后置位，直到用户重新开关或重试 */
  private engineFailed = false
  private epoch = 0
  private download: { promise: Promise<boolean>; controller: AbortController } | null = null
  /** 用户刚确认过首次下载：下一次 reconcile 的下载归因为 first_enable */
  private pendingTrigger: AssetTrigger | null = null
  private lastSetting = ''
  private subscribed = false

  /** 首次使用时订阅设置变化；放在方法里而不是模块顶层，避免仅仅导入就产生副作用 */
  private ensureSubscribed(): void {
    if (this.subscribed) return
    this.subscribed = true
    this.lastSetting = this.settingKey()
    jotaiStore.sub(playerSettingAtom, () => {
      // 播放器的任何设置变化都会触发，只关心翻译相关的两个字段
      const key = this.settingKey()
      if (key === this.lastSetting) return
      this.lastSetting = key
      const trigger = this.pendingTrigger ?? 'auto_recover'
      this.pendingTrigger = null
      void this.reconcile(trigger)
    })
  }

  private get setting() {
    return jotaiStore.get(playerSettingAtom).danmakuTranslation
  }

  private settingKey(): string {
    const { enabled, target } = this.setting
    return `${enabled}:${target}`
  }

  private get unsupportedReason() {
    return detectUnsupportedReason(browserSupportEnvironment(TRANSLATION_ASSETS_BASE))
  }

  /** 设置界面挂载时调用：把状态同步到与当前开关一致（例如启动后首次打开设置） */
  refresh(): void {
    this.ensureSubscribed()
    void this.reconcile('auto_recover')
  }

  /** 播放页的弹幕层挂载时调用，返回卸载函数 */
  attach(session: TranslationSession): () => void {
    this.ensureSubscribed()
    this.session = session
    void this.reconcile('auto_recover')
    return () => {
      if (this.session !== session) return
      // 只撤销会话，不动弹幕条目：条目由 setItems 独立维护（调用方在卸载时自行清空），
      // 这样两者的先后顺序不影响最终状态
      this.session = null
      void this.reconcile('auto_recover')
    }
  }

  /** 当前视频的弹幕条目与被屏蔽的 id；条目变化、屏蔽规则变化时都要调用 */
  setItems(items: readonly TranslatableItem[], blockedIds: ReadonlySet<string>): void {
    this.items = items
    this.blockedIds = blockedIds
    if (this.scheduler) {
      this.scheduler.setItems(items, blockedIds)
      return
    }
    // 引擎尚未加载：开关开着且这次确实有需要翻译的弹幕时才启动
    if (this.setting.enabled && this.session && !this.engineFailed && this.hasTranslatable()) {
      void this.reconcile('auto_recover')
    }
  }

  /**
   * 用户在设置里选择目标语言，null 表示「不翻译」。
   * 选中的语言本机没有资源时先经 confirm 取得同意，取消则保持原样且不下载；
   * 资源已在本机时不再询问。
   */
  async select(target: TranslationTarget | null, confirm: () => Promise<boolean>): Promise<void> {
    this.ensureSubscribed()
    if (target === null) {
      captureFeatureUsed('danmaku_translation', 'disable')
      this.writeSetting({ enabled: false })
      return
    }
    if (this.unsupportedReason) return
    this.engineFailed = false
    const files = listTranslationAssets(target)
    // 查询本机存储失败时按「缺失」处理，由后续下载流程给出具体错误
    const missing = await findMissingAssets(files, opfsAssetStore).catch(() => files)
    if (missing.length > 0) {
      const previous = getDanmakuTranslationStatus()
      setDanmakuTranslationStatus({ state: 'confirming' })
      const accepted = await confirm()
      if (!accepted) {
        // 回到确认之前的状态：原来关着就是关，原来在用别的语言就继续用
        setDanmakuTranslationStatus(previous.state === 'confirming' ? { state: 'off' } : previous)
        captureFeatureUsed('danmaku_translation', 'enable_cancelled', target)
        telemetry.capture('danmaku_translation_assets_downloaded', {
          result: 'cancelled',
          trigger: 'first_enable',
          duration_ms: 0,
          bytes: 0,
        })
        return
      }
      this.pendingTrigger = 'first_enable'
    }
    captureFeatureUsed('danmaku_translation', 'enable', target)
    const current = this.setting
    if (current.enabled && current.target === target) {
      // 设置没有变化（例如引擎出错后重新选择同一项）：订阅不会触发，这里直接推进
      const trigger = this.pendingTrigger ?? 'auto_recover'
      this.pendingTrigger = null
      void this.reconcile(trigger)
    } else {
      this.writeSetting({ enabled: true, target })
    }
  }

  /** 下载失败或引擎出错后的手动重试 */
  retry(): void {
    this.ensureSubscribed()
    captureFeatureUsed('danmaku_translation', 'retry')
    this.engineFailed = false
    void this.reconcile('retry')
  }

  /** 本机翻译资源的占用字节数；环境不支持或查询失败时为 0 */
  async usage(): Promise<number> {
    if (this.unsupportedReason === 'no_storage') return 0
    return opfsAssetStore.usage()
  }

  /** 清除本机翻译资源，并关闭翻译开关（否则下次播放会自动重新下载） */
  async clearAssets(): Promise<void> {
    this.ensureSubscribed()
    this.epoch += 1
    this.download?.controller.abort()
    this.stopEngine()
    this.writeSetting({ enabled: false })
    setDanmakuTranslationStatus(this.unsupportedState() ?? { state: 'off' })
    await opfsAssetStore.clear()
  }

  private writeSetting(patch: Partial<DanmakuTranslationSettings>): void {
    jotaiStore.set(playerSettingAtom, (current) => ({
      ...current,
      danmakuTranslation: { ...current.danmakuTranslation, ...patch },
    }))
  }

  private unsupportedState() {
    const reason = this.unsupportedReason
    return reason ? ({ state: 'unsupported', reason } as const) : null
  }

  private hasTranslatable(): boolean {
    return this.items.some((item) => !this.blockedIds.has(item.id) && needsTranslation(item.text))
  }

  private async reconcile(trigger: AssetTrigger): Promise<void> {
    const epoch = ++this.epoch
    const stale = () => epoch !== this.epoch

    const unsupported = this.unsupportedState()
    if (unsupported) {
      this.stopEngine()
      setDanmakuTranslationStatus(unsupported)
      return
    }
    const { enabled, target } = this.setting
    if (!enabled) {
      this.download?.controller.abort()
      this.stopEngine()
      this.engineFailed = false
      // 确认弹窗打开期间保留「等待确认」，由 toggle 自己收尾
      if (getDanmakuTranslationStatus().state !== 'confirming') {
        setDanmakuTranslationStatus({ state: 'off' })
      }
      return
    }

    const files = listTranslationAssets(target)
    let missing: TranslationAssetFile[]
    try {
      missing = await findMissingAssets(files, opfsAssetStore)
    } catch (error) {
      if (stale()) return
      this.failEngine(
        new TranslationAssetError('assets_storage', '读取本机翻译资源失败', { cause: error }),
      )
      return
    }
    if (stale()) return
    if (missing.length > 0 || this.download) {
      // 资源缺失时引擎不可能在运行；万一还在（资源被外部清掉），先停掉
      this.stopEngine()
      const downloaded = await this.ensureAssets(files, trigger)
      if (stale() || !downloaded) return
    }

    if (this.engineFailed) return
    if (!this.session || !this.hasTranslatable()) {
      this.stopEngine()
      setDanmakuTranslationStatus({ state: 'ready' })
      return
    }
    if (this.client && this.scheduler) {
      this.scheduler.setItems(this.items, this.blockedIds)
      return
    }
    await this.startEngine(target, files, stale)
  }

  /** 下载缺失的资源；同一时间只跑一个下载，重复触发时共用结果 */
  private ensureAssets(
    files: readonly TranslationAssetFile[],
    trigger: AssetTrigger,
  ): Promise<boolean> {
    if (this.download) return this.download.promise
    const controller = new AbortController()
    const startedAt = performance.now()
    const total = totalAssetSize(files)
    let lastPercent = -1
    setDanmakuTranslationStatus({ state: 'downloading', loaded: 0, total })

    const promise = ensureTranslationAssets({
      base: TRANSLATION_ASSETS_BASE!,
      files,
      store: opfsAssetStore,
      signal: controller.signal,
      onProgress: (loaded) => {
        // 流式回调很密，只在百分比变化时更新界面状态
        const percent = Math.floor((loaded / total) * 100)
        if (percent === lastPercent || controller.signal.aborted) return
        lastPercent = percent
        setDanmakuTranslationStatus({ state: 'downloading', loaded, total })
      },
    })
      .then((result) => {
        telemetry.capture('danmaku_translation_assets_downloaded', {
          result: 'success',
          trigger,
          duration_ms: Math.round(performance.now() - startedAt),
          bytes: result.downloadedBytes,
        })
        return true
      })
      .catch((error: unknown) => {
        const duration = Math.round(performance.now() - startedAt)
        if (isAssetAbort(error)) {
          // 下载途中关闭了翻译或清除了资源：预期情况，不作为异常
          telemetry.capture('danmaku_translation_assets_downloaded', {
            result: 'cancelled',
            trigger,
            duration_ms: duration,
            bytes: 0,
          })
          return false
        }
        const code = error instanceof TranslationAssetError ? error.code : 'assets_network'
        telemetry.capture('danmaku_translation_assets_downloaded', {
          result: 'failed',
          trigger,
          error_code: code,
          duration_ms: duration,
          bytes: 0,
        })
        // 断网属于用户环境问题，只记日志；其余（HTTP 状态、校验、存储）按异常上报
        reportOperationalError(
          'player',
          'translation.assets_download',
          error,
          code === 'assets_network',
        )
        if (this.setting.enabled) setDanmakuTranslationStatus({ state: 'download_failed', code })
        return false
      })
      .finally(() => {
        if (this.download?.controller === controller) this.download = null
      })
    this.download = { promise, controller }
    return promise
  }

  private async startEngine(
    target: TranslationTarget,
    files: readonly TranslationAssetFile[],
    stale: () => boolean,
  ): Promise<void> {
    setDanmakuTranslationStatus({ state: 'starting' })
    const startedAt = performance.now()
    let client: TranslatorClient | null = null
    try {
      const buffers = await Promise.all(files.map((file) => opfsAssetStore.read(file.name)))
      if (stale()) return
      const byKind = new Map(files.map((file, index) => [file.kind, buffers[index]]))
      const engine = byKind.get('engine')
      const model = byKind.get('model')
      const lex = byKind.get('lex')
      const vocab = byKind.get('vocab')
      if (!engine || !model || !lex || !vocab) {
        // 检查之后文件又不见了（被浏览器回收或被清除）：重新走一遍，缺的会重新下载
        void this.reconcile('auto_recover')
        return
      }
      const pair = TRANSLATION_PAIRS[translationPairId(target)]
      client = new TranslatorClient()
      await client.init({ engine, model, lex, vocab }, pair.source, pair.target)
      if (stale()) {
        client.dispose()
        return
      }
    } catch (error) {
      client?.dispose()
      if (stale() || isTranslatorDisposed(error)) return
      this.failEngine(error)
      return
    }

    this.engineStartMs = Math.round(performance.now() - startedAt)
    this.client = client
    const activeClient = client
    this.scheduler = new TranslationScheduler({
      translate: (texts) => activeClient.translate(texts),
      store: translationStore,
      now: () => this.session?.now() ?? 0,
      onProgress: ({ done, total }) => {
        if (this.client !== activeClient) return
        setDanmakuTranslationStatus(
          total === 0
            ? { state: 'ready' }
            : done < total
              ? { state: 'translating', done, total }
              : { state: 'done', total },
        )
      },
      onComplete: (summary) =>
        telemetry.capture('danmaku_translation_completed', {
          items: summary.items,
          unique_texts: summary.uniqueTexts,
          translated_texts: summary.translatedTexts,
          duration_ms: Math.round(summary.durationMs),
          engine_start_ms: this.engineStartMs,
          target,
        }),
      onError: (error) => {
        if (this.client !== activeClient || isTranslatorDisposed(error)) return
        this.failEngine(error)
      },
    })
    this.scheduler.setItems(this.items, this.blockedIds)
    this.scheduler.start()
  }

  private stopEngine(): void {
    this.scheduler?.stop()
    this.scheduler = null
    this.client?.dispose()
    this.client = null
  }

  /** 引擎或本机资源读取出错：停止翻译、回退原文、上报，等待用户重试 */
  private failEngine(error: unknown): void {
    this.stopEngine()
    this.engineFailed = true
    const code =
      error instanceof TranslatorError
        ? error.code
        : error instanceof TranslationAssetError
          ? 'assets_storage'
          : 'engine_run'
    setDanmakuTranslationStatus({ state: 'engine_failed', code })
    reportOperationalError(
      'player',
      error instanceof TranslatorError && error.code === 'engine_init'
        ? 'translation.engine_init'
        : error instanceof TranslationAssetError
          ? 'translation.assets_read'
          : 'translation.engine_run',
      error,
    )
  }
}

/**
 * 开发态热更新时沿用同一个实例：本模块或它依赖的文件被修改后会重新求值，
 * 若此时新建实例，播放页早先登记的会话与弹幕条目都不在新实例上
 *（React 不会因为依赖模块更新而重跑 effect），表现为开关显示「已开启」却不翻译。
 * 正式构建没有热更新，这段逻辑不生效。
 */
const hotData = import.meta.hot?.data as { service?: DanmakuTranslationService } | undefined

export const danmakuTranslation = hotData?.service ?? new DanmakuTranslationService()

if (hotData) hotData.service = danmakuTranslation
