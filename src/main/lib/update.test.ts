import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  events: new Map<string, (...args: unknown[]) => void>(),
  appEvents: new Map<string, (...args: unknown[]) => void>(),
  version: vi.fn(() => '1.0.0'),
  feed: vi.fn(),
  check: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
  send: vi.fn(),
  prepare: vi.fn(),
  quit: vi.fn(),
  dialog: vi.fn(),
  initialize: vi.fn(),
  resume: vi.fn(),
  playing: vi.fn(),
  window: { isDestroyed: (): boolean => false },
}))
vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getVersion: mocks.version,
    on: (name: string, callback: (...args: unknown[]) => void) =>
      mocks.appEvents.set(name, callback),
    quit: mocks.quit,
  },
  dialog: { showMessageBox: mocks.dialog },
  shell: { openExternal: vi.fn() },
}))
vi.mock('electron-updater', () => ({
  default: {
    autoUpdater: {
      on: (name: string, callback: (...args: unknown[]) => void) =>
        mocks.events.set(name, callback),
      setFeedURL: mocks.feed,
      checkForUpdates: mocks.check,
      downloadUpdate: mocks.download,
      quitAndInstall: mocks.install,
    },
  },
}))
vi.mock('electron-log', () => ({ default: { error: vi.fn(), warn: vi.fn() } }))
vi.mock('@main/windows/main', () => ({ getMainWindow: () => mocks.window }))
vi.mock('@main/windows/setting', () => ({
  getRendererHandlers: () => ({
    desktopUpdate: { send: mocks.send },
    prepareUpdate: { send: mocks.prepare },
  }),
}))
vi.mock('./utils', () => ({ parseReleaseNotes: (value: string) => value }))
vi.mock('@marchen/sparkle-updater', () => ({
  loadSparkleBridge: () => ({
    available: true,
    bridge: {
      initialize: mocks.initialize,
      resumeInstall: mocks.resume,
      setPlaying: mocks.playing,
    },
  }),
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.version.mockReturnValue('1.0.0')
  mocks.events.clear()
  mocks.appEvents.clear()
  vi.useFakeTimers()
  mocks.dialog.mockResolvedValue({ response: 0 })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('桌面更新服务', () => {
  it('windows 合并检查与下载、保留晚订阅快照，显式保存成功才安装', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    const service = await import('./update')
    await service.autoUpdateInit()
    let finish!: () => void
    mocks.check.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    const a = service.checkForDesktopUpdates()
    const b = service.checkForDesktopUpdates()
    expect(mocks.check).toHaveBeenCalledTimes(1)
    mocks.events.get('update-available')!({ version: '0.2.0', releaseNotes: '更新说明' })
    expect(service.getUpdateState()).toMatchObject({
      phase: 'available',
      version: '0.2.0',
      revision: 1,
    })
    finish()
    await Promise.all([a, b])
    mocks.download.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    const download = service.downloadDesktopUpdate()
    await service.downloadDesktopUpdate()
    expect(mocks.download).toHaveBeenCalledTimes(1)
    mocks.events.get('download-progress')!({ percent: 100 })
    expect(service.getUpdateState().phase).toBe('preparing')
    mocks.events.get('update-downloaded')!()
    finish()
    await download
    const installing = service.installDesktopUpdate()
    expect(mocks.install).not.toHaveBeenCalled()
    service.acknowledgeUpdateSave(mocks.prepare.mock.calls[0][0], true)
    await installing
    expect(mocks.install).toHaveBeenCalledTimes(1)
    const { default: updater } = await import('electron-updater')
    expect(updater.autoUpdater.autoInstallOnAppQuit).toBe(false)
    expect(updater.autoUpdater.autoDownload).toBe(false)
  })
  it('windows 下载失败可重试，不把点击安装写成已更新', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    const service = await import('./update')
    await service.autoUpdateInit()
    mocks.events.get('update-available')!({ version: '0.2.0' })
    mocks.download.mockRejectedValueOnce(new Error('断网')).mockResolvedValueOnce([])
    await service.downloadDesktopUpdate()
    expect(service.getUpdateState()).toMatchObject({ phase: 'error', error: '断网' })
    await service.downloadDesktopUpdate()
    expect(mocks.download).toHaveBeenCalledTimes(2)
    expect(mocks.install).not.toHaveBeenCalled()
  })
  it('mac 原生安装请求在保存失败后保持运行，显式重试保存再恢复', async () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'darwin',
      arch: 'arm64',
      resourcesPath: '/test',
    })
    const service = await import('./update')
    await service.autoUpdateInit()
    mocks.dialog.mockResolvedValueOnce({ response: 1 })
    mocks.initialize.mock.calls[0][0]('prepare-install')
    service.acknowledgeUpdateSave(mocks.prepare.mock.calls[0][0], false, '写入失败')
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.resume).not.toHaveBeenCalled()
    expect(mocks.prepare).toHaveBeenCalledTimes(2)
    service.acknowledgeUpdateSave(mocks.prepare.mock.calls[1][0], true)
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.resume).toHaveBeenCalledTimes(1)
  })
  it('mac 已关闭窗口时允许退出，不等待不存在的 renderer', async () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'darwin',
      arch: 'arm64',
      resourcesPath: '/test',
    })
    vi.spyOn(mocks.window, 'isDestroyed').mockReturnValue(true)
    const service = await import('./update')
    await service.autoUpdateInit()
    const preventDefault = vi.fn()
    mocks.appEvents.get('before-quit')!({ preventDefault })
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.quit).toHaveBeenCalledTimes(1)
  })
  it('mac 关闭主窗口前等待保存，无活动媒体回执后才销毁', async () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'darwin',
      arch: 'arm64',
      resourcesPath: '/test',
    })
    const service = await import('./update')
    await service.autoUpdateInit()
    let onClose!: (event: { preventDefault: () => void }) => void
    const close = vi.fn()
    Object.assign(mocks.window, {
      on: (_: string, callback: typeof onClose) => {
        onClose = callback
      },
      close,
    })
    mocks.appEvents.get('browser-window-created')!(null, mocks.window)
    onClose({ preventDefault: vi.fn() })
    expect(close).not.toHaveBeenCalled()
    service.acknowledgeUpdateSave(mocks.prepare.mock.calls[0][0], true)
    await vi.advanceTimersByTimeAsync(0)
    expect(close).toHaveBeenCalledTimes(1)
    expect(mocks.playing).toHaveBeenCalledWith(false)
  })
  it.each(['1.0.0', '1.0.0-beta.0', '1.0.0-alpha.0'])(
    'windows %s 使用对应固定源且禁止降级',
    async (version) => {
      vi.stubGlobal('process', { ...process, platform: 'win32' })
      mocks.version.mockReturnValue(version)
      const service = await import('./update')
      await service.autoUpdateInit()
      const channel = version.includes('alpha')
        ? 'alpha'
        : version.includes('beta')
          ? 'beta'
          : 'stable'
      expect(mocks.feed).toHaveBeenCalledWith({
        provider: 'generic',
        url: expect.stringContaining(`/windows/${channel}/`),
      })
      const { default: updater } = await import('electron-updater')
      expect(updater.autoUpdater.allowDowngrade).toBe(false)
      expect(updater.autoUpdater.allowPrerelease).toBe(channel !== 'stable')
      expect(updater.autoUpdater.channel).toBe(channel === 'stable' ? 'latest' : channel)
    },
  )
  it('windows 未知版本不回落到默认更新源', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    mocks.version.mockReturnValue('1.0.0-rc.0')
    const service = await import('./update')
    await service.autoUpdateInit()
    await service.checkForDesktopUpdates()
    expect(service.getUpdateState().phase).toBe('error')
    expect(mocks.feed).not.toHaveBeenCalled()
    expect(mocks.check).not.toHaveBeenCalled()
  })
})
