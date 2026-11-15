import type { EnsureAssetsOptions, EnsureAssetsResult } from '../assets/download'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 预下载的服务层行为：只准备资源、不改设置、不启动引擎；失败不提示；
 * 途中被用户主动开启时沿用同一个下载。下载与本机存储都用替身，不发请求也不碰 OPFS。
 */
const mocks = vi.hoisted(() => ({
  /** 本机缺失的文件；用例按需改成空数组表示资源齐全 */
  missing: [{ name: 'model.bin', size: 100 }] as Array<{ name: string; size: number }>,
  download: vi.fn<(options: EnsureAssetsOptions) => Promise<EnsureAssetsResult>>(),
  capture: vi.fn(),
  reportOperationalError: vi.fn(),
  markTranslationPromptAnswered: vi.fn(),
  setTranslationPreloadOptOut: vi.fn(),
  clientCreated: vi.fn(),
  storeClear: vi.fn(async () => {}),
}))

vi.mock('@renderer/atoms/settings/player', async () => {
  const { atom } = await import('jotai')
  return {
    playerSettingAtom: atom({ danmakuTranslation: { enabled: false, target: 'en' } }),
  }
})
vi.mock('@renderer/atoms/settings/app', () => ({
  markTranslationPromptAnswered: mocks.markTranslationPromptAnswered,
  setTranslationPreloadOptOut: mocks.setTranslationPreloadOptOut,
}))
vi.mock('@renderer/lib/env', () => ({
  TRANSLATION_ASSETS_BASE: 'https://assets.example.invalid/translation',
}))
vi.mock('@renderer/services/telemetry/client', () => ({ telemetry: { capture: mocks.capture } }))
vi.mock('@renderer/services/telemetry/features', () => ({ captureFeatureUsed: vi.fn() }))
vi.mock('@renderer/services/telemetry/operational-errors', () => ({
  reportOperationalError: mocks.reportOperationalError,
}))
vi.mock('../assets/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets/download')>()),
  findMissingAssets: vi.fn(async () => mocks.missing),
  ensureTranslationAssets: mocks.download,
}))
vi.mock('../assets/store', () => ({
  isAssetStoreSupported: () => true,
  opfsAssetStore: { clear: mocks.storeClear, usage: async () => 0 },
}))
vi.mock('../support', () => ({
  browserSupportEnvironment: () => ({}),
  detectUnsupportedReason: () => null,
}))
vi.mock('../engine/client', () => ({
  isTranslatorDisposed: () => false,
  TranslatorError: class extends Error {},
  TranslatorClient: class {
    constructor() {
      mocks.clientCreated()
    }
  },
}))

/** 每个用例重新加载服务，得到一个干净的实例与状态 */
const load = async () => {
  vi.resetModules()
  const { danmakuTranslation } = await import('../service')
  const { getDanmakuTranslationStatus } = await import('../status')
  const { playerSettingAtom } = await import('@renderer/atoms/settings/player')
  const { jotaiStore } = await import('@renderer/atoms/store')
  const { TranslationAssetError } = await import('../assets/download')
  return {
    service: danmakuTranslation,
    status: getDanmakuTranslationStatus,
    setting: () => jotaiStore.get(playerSettingAtom).danmakuTranslation,
    TranslationAssetError,
  }
}

/** 一次由用例控制何时结束的下载 */
const deferredDownload = () => {
  let finish!: (result: EnsureAssetsResult) => void
  let fail!: (error: unknown) => void
  let options!: EnsureAssetsOptions
  mocks.download.mockImplementationOnce((received) => {
    options = received
    return new Promise<EnsureAssetsResult>((resolve, reject) => {
      finish = resolve
      fail = reject
    })
  })
  return {
    finish: () => finish({ downloadedFiles: 1, downloadedBytes: 100 }),
    fail: (error: unknown) => fail(error),
    options: () => options,
  }
}

/** 等待服务内部排队的异步步骤跑完 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  mocks.missing = [{ name: 'model.bin', size: 100 }]
  vi.clearAllMocks()
})

describe('翻译资源预下载', () => {
  it('成功：期间显示准备进度，结束后回到未开启，不改设置也不启动引擎', async () => {
    const { service, status, setting } = await load()
    const download = deferredDownload()
    const running = service.preload('en')
    await settle()
    expect(status().state).toBe('preparing')
    download.options().onProgress?.(50, 100)
    expect(status()).toMatchObject({ state: 'preparing', loaded: 50 })

    download.finish()
    await running
    expect(status()).toEqual({ state: 'off' })
    expect(setting().enabled).toBe(false)
    expect(mocks.clientCreated).not.toHaveBeenCalled()
    expect(mocks.capture).toHaveBeenCalledWith(
      'danmaku_translation_assets_downloaded',
      expect.objectContaining({ result: 'success', trigger: 'preload' }),
    )
  })

  it('失败：不抛出、不进入带重试的失败状态，回到未开启', async () => {
    const { service, status, TranslationAssetError } = await load()
    const download = deferredDownload()
    const running = service.preload('en')
    await settle()
    download.fail(new TranslationAssetError('assets_network', '翻译资源下载失败，请检查网络'))
    await expect(running).resolves.toBeUndefined()
    expect(status()).toEqual({ state: 'off' })
    expect(mocks.capture).toHaveBeenCalledWith(
      'danmaku_translation_assets_downloaded',
      expect.objectContaining({ result: 'failed', trigger: 'preload' }),
    )
  })

  it('资源已在本机或翻译已开启时不下载', async () => {
    const { service } = await load()
    mocks.missing = []
    await service.preload('en')
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it('翻译关着时的状态同步（打开设置、进出播放页）不会中止预下载', async () => {
    const { service, status } = await load()
    const download = deferredDownload()
    void service.preload('en')
    await settle()
    service.refresh()
    const detach = service.attach({ now: () => 0 })
    detach()
    await settle()
    expect(download.options().signal?.aborted).toBe(false)
    expect(status().state).toBe('preparing')
    download.finish()
    await settle()
  })

  it('途中被用户主动开启：沿用同一个下载，状态改为下载中，完成后翻译已开启', async () => {
    const { service, status, setting } = await load()
    const download = deferredDownload()
    void service.preload('en')
    await settle()
    download.options().onProgress?.(40, 100)

    // 界面语言就是目标语言时调用方不弹确认，确认函数直接返回同意
    await service.select('en', async () => true)
    await settle()
    expect(setting().enabled).toBe(true)
    expect(status()).toMatchObject({ state: 'downloading', loaded: 40 })
    expect(mocks.download).toHaveBeenCalledOnce()
    expect(download.options().signal?.aborted).toBe(false)

    mocks.missing = []
    download.finish()
    await settle()
    // 不在播放页：资源就绪即为「已开启」，引擎等到有弹幕要翻译时才加载
    expect(status()).toEqual({ state: 'ready' })
    expect(mocks.clientCreated).not.toHaveBeenCalled()
  })

  it('被接管后下载失败：按主动下载处理，显示可重试的失败状态', async () => {
    const { service, status, TranslationAssetError } = await load()
    const download = deferredDownload()
    void service.preload('en')
    await settle()
    await service.select('en', async () => true)
    await settle()
    download.fail(new TranslationAssetError('assets_http', '翻译资源下载失败（HTTP 503）'))
    await settle()
    expect(status()).toEqual({ state: 'download_failed', code: 'assets_http' })
  })
})

describe('预下载的退出标记', () => {
  it('清除翻译模型：中止正在进行的预下载并记下不再自动下载', async () => {
    const { service, status } = await load()
    const download = deferredDownload()
    void service.preload('en')
    await settle()
    await service.clearAssets()
    expect(download.options().signal?.aborted).toBe(true)
    expect(mocks.setTranslationPreloadOptOut).toHaveBeenCalledWith(true)
    expect(mocks.storeClear).toHaveBeenCalledOnce()
    expect(status()).toEqual({ state: 'off' })
  })

  it('用户主动开启翻译：清掉退出标记并记为已做过选择', async () => {
    const { service } = await load()
    mocks.missing = []
    await service.select('en', async () => true)
    expect(mocks.setTranslationPreloadOptOut).toHaveBeenCalledWith(false)
    expect(mocks.markTranslationPromptAnswered).toHaveBeenCalled()
  })

  it('在确认弹窗里取消：算做过选择，但不清掉退出标记', async () => {
    const { service } = await load()
    await service.select('en', async () => false)
    expect(mocks.markTranslationPromptAnswered).toHaveBeenCalled()
    expect(mocks.setTranslationPreloadOptOut).not.toHaveBeenCalled()
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it('改回不翻译也算做过选择', async () => {
    const { service } = await load()
    await service.select(null, async () => true)
    expect(mocks.markTranslationPromptAnswered).toHaveBeenCalled()
  })
})
