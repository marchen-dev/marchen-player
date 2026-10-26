import type { DesktopUpdateState } from '@marchen/shared/types/update'
import type { SparkleBridge } from '@marchen/sparkle-updater'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeLog } from '@main/lib/diagnostic-log'
import { getMainWindow } from '@main/windows/main'
import { getRendererHandlers } from '@main/windows/setting'
import { parseReleaseVersion, updateFeedURL } from '@marchen/shared/update-policy'
import { loadSparkleBridge } from '@marchen/sparkle-updater'
import { app, dialog, shell } from 'electron'
import logger from 'electron-log'
import updater from 'electron-updater'
import { UpdateSaveBarrier } from './update-save'
import { isVersionUpgrade } from './update-version'
import { parseReleaseNotes } from './utils'

const releasePage = 'https://github.com/marchen-dev/marchen-player/releases'
const { autoUpdater } = updater
let bridge: SparkleBridge | undefined
let initialized = false
// Windows / Linux 共用 electron-updater，配置完成前不响应检查、下载与安装。
let updaterConfigured = false
let quitting = false
let installing = false
let checkPromise: Promise<unknown> | undefined
let downloadPromise: Promise<unknown> | undefined
let state: DesktopUpdateState = {
  revision: 0,
  phase: 'idle',
  platform:
    process.platform === 'darwin'
      ? 'mac'
      : process.platform === 'win32'
        ? 'windows'
        : process.platform === 'linux'
          ? // AppImage 运行时注入 APPIMAGE；deb 等系统包没有，由包管理器负责替换文件。
            process.env.APPIMAGE
            ? 'linux'
            : 'linux-manual'
          : 'unsupported',
}
/** 使用 electron-updater 检查更新的平台 */
const usesElectronUpdater = () =>
  state.platform === 'windows' || state.platform === 'linux' || state.platform === 'linux-manual'
/** 可在应用内下载并替换自身的平台 */
const canInstallInApp = () => state.platform === 'windows' || state.platform === 'linux'
const barrier = new UpdateSaveBarrier((id) => {
  const win = getMainWindow()
  // 主窗口关闭前已完成同一保存屏障；无窗口时没有仍在播放的会话。
  if (!win || win.isDestroyed()) {
    barrier.finish(id, true)
    return
  }
  getRendererHandlers()?.prepareUpdate.send(id)
})
/** 下载进度的空值，开始新下载或已是最新时清掉上一次的残留数值 */
const emptyProgress = {
  percent: undefined,
  transferred: undefined,
  total: undefined,
  bytesPerSecond: undefined,
}
const publish = (patch: Partial<DesktopUpdateState>) => {
  state = { ...state, ...patch, revision: state.revision + 1 }
  getRendererHandlers()?.desktopUpdate.send(state)
}
const fail = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  writeLog({ lv: 'error', cat: 'updater', msg: 'update_failed', data: { message } })
  publish({ phase: 'error', error: message })
}
/**
 * Linux 恢复支持前的渠道版本没有 Linux 元数据，渠道源中对应文件不存在（404）。
 * 这表示该渠道暂无 Linux 版本，按「已是最新」处理；其他错误与 Windows 一致上报。
 */
const failOrUpToDate = (error: unknown) => {
  if (
    state.platform !== 'windows' &&
    (error as { code?: unknown } | null)?.code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
  ) {
    writeLog({ lv: 'warn', cat: 'updater', msg: 'linux_channel_metadata_missing' })
    publish({ phase: 'upToDate', version: undefined, notes: undefined, ...emptyProgress })
    return
  }
  fail(error)
}
export const getUpdateState = () => state
export const acknowledgeUpdateSave = (id: string, success: boolean, message?: string) =>
  barrier.finish(id, success, message)
export const setUpdatePlaybackState = (playing: boolean) => bridge?.setPlaying(playing)
// 已知新版本时直接打开对应 Release，便于 deb 用户找到同版本安装包。
export const openUpdateDownloadPage = () =>
  shell.openExternal(state.version ? `${releasePage}/tag/v${state.version}` : releasePage)

async function prepareInstall(resume: () => void) {
  if (installing) return
  installing = true
  try {
    while (true) {
      try {
        await barrier.wait()
        publish({ phase: 'installing', error: undefined })
        quitting = true
        resume()
        return
      } catch (error) {
        quitting = false
        fail(error)
        const result = await dialog.showMessageBox({
          type: 'warning',
          message: '尚未完成更新安装，请重试',
          detail: state.error,
          buttons: ['稍后', '重试保存并安装'],
          defaultId: 0,
          cancelId: 0,
        })
        if (result.response !== 1) return
      }
    }
  } finally {
    installing = false
  }
}

export async function autoUpdateInit() {
  if (initialized || !app.isPackaged) return
  initialized = true
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    const loaded = loadSparkleBridge(join(process.resourcesPath, 'sparkle/sparkle.node'))
    if (loaded.available) {
      try {
        bridge = loaded.bridge
        bridge.initialize((event) => {
          if (event === 'prepare-install') void prepareInstall(() => bridge?.resumeInstall())
          if (event === 'error') {
            writeLog({ lv: 'warn', cat: 'updater', msg: 'sparkle_error_reported' })
          }
        })
      } catch (error) {
        bridge = undefined
        fail(error)
      }
    } else fail(new Error(loaded.reason))
    // macOS 关闭主窗口后仍可从菜单更新；必须在 renderer 销毁前保存。
    app.on('browser-window-created', (_, window) => {
      let closing = false
      window.on('close', (event) => {
        if (window !== getMainWindow() || quitting || closing) return
        event.preventDefault()
        if (installing) return
        installing = true
        void barrier
          .wait()
          .then(() => {
            closing = true
            bridge?.setPlaying(false)
            window.close()
          })
          .catch(async (error) => {
            fail(error)
            await dialog.showMessageBox({
              type: 'warning',
              message: '播放进度未保存，暂未关闭',
              detail: state.error,
            })
          })
          .finally(() => {
            installing = false
          })
      })
    })
    // 官方 postpone 回调不覆盖所有退出方式；普通退出也走同一保存屏障。
    app.on('before-quit', (event) => {
      if (quitting) return
      event.preventDefault()
      if (installing) return
      installing = true
      void barrier
        .wait()
        .then(() => {
          quitting = true
          app.quit()
        })
        .catch(async (error) => {
          fail(error)
          await dialog.showMessageBox({
            type: 'warning',
            message: '播放进度未保存，暂未退出',
            detail: state.error,
          })
        })
        .finally(() => {
          installing = false
        })
    })
    return
  }
  if (!usesElectronUpdater()) return
  autoUpdater.logger = logger
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  let channel: ReturnType<typeof parseReleaseVersion>['channel']
  try {
    channel = parseReleaseVersion(app.getVersion()).channel
  } catch (error) {
    fail(error)
    return
  }
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: updateFeedURL(state.platform === 'windows' ? 'windows' : 'linux', channel),
  })
  autoUpdater.channel = channel === 'stable' ? 'latest' : channel
  autoUpdater.allowPrerelease = channel !== 'stable'
  // channel setter 会开启 allowDowngrade，必须在设置渠道后明确关闭。
  autoUpdater.allowDowngrade = false
  autoUpdater.forceDevUpdateConfig = false
  updaterConfigured = true
  autoUpdater.on('error', failOrUpToDate)
  autoUpdater.on('checking-for-update', () => publish({ phase: 'checking', error: undefined }))
  autoUpdater.on('update-available', (info) =>
    publish({
      phase: 'available',
      version: info.version,
      notes: parseReleaseNotes(info.releaseNotes),
    }),
  )
  autoUpdater.on('update-not-available', () =>
    publish({ phase: 'upToDate', version: undefined, notes: undefined, ...emptyProgress }),
  )
  autoUpdater.on('download-progress', (progress) =>
    publish({
      phase: progress.percent >= 100 ? 'preparing' : 'downloading',
      percent: Math.min(100, Math.max(0, progress.percent)),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    }),
  )
  autoUpdater.on('update-downloaded', () => publish({ phase: 'ready', percent: 100 }))
  setTimeout(() => {
    void checkForDesktopUpdates()
  }, 10000).unref()
}

export async function checkForDesktopUpdates() {
  if (!app.isPackaged) {
    publish({ phase: 'error', error: '开发模式不检查更新' })
    return state
  }
  if (state.platform === 'mac') {
    if (bridge) bridge.checkForUpdates()
    else {
      const result = await dialog.showMessageBox({
        type: 'warning',
        message: '应用内更新暂不可用',
        detail: '请到发布页手动下载新版。',
        buttons: ['取消', '前往下载'],
        defaultId: 0,
      })
      if (result.response === 1) await openUpdateDownloadPage()
    }
    return state
  }
  if (
    !usesElectronUpdater() ||
    !updaterConfigured ||
    ['downloading', 'preparing', 'ready', 'installing'].includes(state.phase)
  )
    return state
  if (!checkPromise)
    checkPromise = autoUpdater
      .checkForUpdates()
      .catch(failOrUpToDate)
      .finally(() => {
        checkPromise = undefined
      })
  await checkPromise
  return state
}
export async function downloadDesktopUpdate() {
  if (
    !canInstallInApp() ||
    !updaterConfigured ||
    !['available', 'error'].includes(state.phase) ||
    !state.version
  )
    return state
  if (!downloadPromise) {
    publish({ ...emptyProgress, phase: 'downloading', percent: 0, error: undefined })
    downloadPromise = autoUpdater
      .downloadUpdate()
      .catch(fail)
      .finally(() => {
        downloadPromise = undefined
      })
  }
  await downloadPromise
  return state
}
export async function installDesktopUpdate() {
  if (!canInstallInApp() || !updaterConfigured || state.phase !== 'ready') return
  await prepareInstall(() => autoUpdater.quitAndInstall())
}

let installedNotice: Promise<{ version: string; notes: string } | null> | undefined
let noticeConsumed = false
export async function getInstalledUpdateNotice() {
  if (!app.isPackaged) return Promise.resolve(null)
  installedNotice ??= (async () => {
    const path = join(app.getPath('userData'), 'last-run-version.json')
    let previous: unknown
    try {
      previous = JSON.parse(await readFile(path, 'utf8')).version
    } catch {
      /* 首次启动没有旧版本。 */
    }
    const current = app.getVersion()
    let notes = ''
    try {
      notes = await readFile(join(process.resourcesPath, 'release-notes.md'), 'utf8')
    } catch {
      /* 没有说明时只显示版本。 */
    }
    await writeFile(path, JSON.stringify({ version: current }), 'utf8')
    return typeof previous === 'string' && isVersionUpgrade(previous, current)
      ? { version: current, notes }
      : null
  })()
  const notice = await installedNotice
  if (noticeConsumed) return null
  noticeConsumed = true
  return notice
}
