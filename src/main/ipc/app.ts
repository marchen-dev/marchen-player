import type { DiagnosticLogLevel } from '@main/lib/diagnostic-log'
import type { FeedbackInput } from '@main/telemetry/feedback'
import { logDirectory, writeLog } from '@main/lib/diagnostic-log'
import { fileOpenRequests } from '@main/lib/file-open-requests'
import {
  acknowledgeUpdateSave,
  checkForDesktopUpdates,
  downloadDesktopUpdate,
  getInstalledUpdateNotice,
  getUpdateState,
  installDesktopUpdate,
  openUpdateDownloadPage,
  setUpdatePlaybackState,
} from '@main/lib/update'
import { isFeedbackAvailable, sendFeedback } from '@main/telemetry/feedback'
import { getOrCreateTelemetryInstallId, telemetryAppSessionId } from '@main/telemetry/identity'
import { getMainWindow } from '@main/windows/main'
import { performClearData } from '@main/windows/setting'
import { tipc } from '@marchen/electron-ipc/main'
import { app, BrowserWindow, dialog, shell } from 'electron'

const t = tipc.create()

interface RendererLogEntry {
  t?: string
  lv: DiagnosticLogLevel
  cat?: string
  msg: string
  op?: string
  data?: unknown
}

const LOG_LEVELS = new Set<unknown>(['debug', 'info', 'warn', 'error'])
/** 单批上限，防止异常 renderer 一次塞入过多条目 */
const MAX_LOG_BATCH = 200

export const appGroup = {
  torrentOpenReady: t.procedure.action(async ({ context }) => {
    if (getMainWindow()?.webContents !== context.sender) return
    fileOpenRequests.torrentReady((request) => context.sender.send('openTorrent', request))
  }),
  torrentHandled: t.procedure.input<{ id: string }>().action(async ({ context, input }) => {
    if (getMainWindow()?.webContents === context.sender) fileOpenRequests.torrentHandled(input.id)
  }),
  fileOpenReady: t.procedure.action(async ({ context }) => {
    // 只允许当前主窗口声明就绪，避免旧窗口或其他页面消费请求。
    const window = getMainWindow()
    if (!window || window.webContents !== context.sender) return
    fileOpenRequests.rendererReady((path) => {
      context.sender.send('importAnime', { path })
    })
  }),
  getTelemetryIdentity: t.procedure.action(async () => ({
    installId: await getOrCreateTelemetryInstallId(),
    appSessionId: telemetryAppSessionId,
    platform: process.platform,
    arch: process.arch,
  })),

  windowAction: t.procedure
    .input<{
      action:
        | 'close'
        | 'minimize'
        | 'maximum'
        | 'restart'
        | 'reset'
        | 'laungh-at-login'
        | 'enter-full-screen'
        | 'leave-full-screen'
        | 'switch-full-screen'
        | 'hidden-title-bar'
        | 'show-title-bar'
      checked?: boolean
    }>()
    .action(async ({ context, input }) => {
      const webcontent = context.sender
      const window = BrowserWindow.fromWebContents(webcontent)
      if (!window) return

      switch (input.action) {
        case 'close': {
          window.close()
          break
        }
        case 'minimize': {
          window.minimize()
          break
        }
        case 'maximum': {
          if (window.isMaximized()) {
            window.unmaximize()
          } else {
            window.maximize()
          }
          break
        }
        case 'restart': {
          getMainWindow()?.reload()
          break
        }
        case 'reset': {
          // renderer 已完成确认，这里不再二次确认
          performClearData()
          break
        }
        case 'laungh-at-login': {
          app.setLoginItemSettings({
            openAtLogin: input.checked,
          })
          break
        }
        case 'switch-full-screen': {
          if (window.isFullScreen()) {
            window.setFullScreen(false)
          } else {
            window.setFullScreen(true)
          }
          break
        }
        case 'enter-full-screen': {
          window.setFullScreen(true)
          break
        }
        case 'leave-full-screen': {
          window.setFullScreen(false)
          break
        }
        case 'hidden-title-bar': {
          window?.setWindowButtonVisibility(false)
          break
        }
        case 'show-title-bar': {
          window?.setWindowButtonVisibility(true)
          break
        }
      }
    }),

  checkUpdate: t.procedure.action(() => checkForDesktopUpdates()),
  getInstalledUpdate: t.procedure.action(() => getInstalledUpdateNotice()),
  getUpdateState: t.procedure.action(async () => getUpdateState()),
  downloadUpdate: t.procedure.action(() => downloadDesktopUpdate()),
  installUpdate: t.procedure.action(() => installDesktopUpdate()),
  openUpdateDownload: t.procedure.action(() => openUpdateDownloadPage()),
  updateSaved: t.procedure
    .input<{ id: string; success: boolean; message?: string }>()
    .action(async ({ input }) => acknowledgeUpdateSave(input.id, input.success, input.message)),
  updatePlaybackState: t.procedure
    .input<{ playing: boolean }>()
    .action(async ({ input }) => setUpdatePlaybackState(input.playing)),

  /** 当前窗口 session 的 HTTP 缓存大小（字节），用于设置页数据区展示 */
  getNetworkCacheSize: t.procedure.action(async ({ context }) =>
    context.sender.session.getCacheSize(),
  ),
  /** 清理当前窗口 session 的 HTTP 缓存；不影响 IndexedDB、localStorage 与下载任务 */
  clearNetworkCache: t.procedure.action(async ({ context }) => context.sender.session.clearCache()),

  /**
   * 接收 renderer 批量发来的诊断日志。main 是唯一写入者，避免多进程追加交错；
   * 只做最小形状校验，异常条目直接丢弃。
   */
  appendLogs: t.procedure.input<{ entries: RendererLogEntry[] }>().action(async ({ input }) => {
    for (const entry of input.entries.slice(0, MAX_LOG_BATCH)) {
      if (!LOG_LEVELS.has(entry?.lv) || typeof entry.msg !== 'string') continue
      writeLog({
        t: typeof entry.t === 'string' ? entry.t : undefined,
        lv: entry.lv,
        src: 'renderer',
        cat: typeof entry.cat === 'string' ? entry.cat : 'renderer',
        msg: entry.msg,
        op: typeof entry.op === 'string' ? entry.op : undefined,
        data: entry.data,
      })
    }
  }),
  feedbackAvailable: t.procedure.action(async () => isFeedbackAvailable()),
  sendFeedback: t.procedure.input<FeedbackInput>().action(async ({ input }) => sendFeedback(input)),
  openLogDirectory: t.procedure.action(async () => {
    const error = await shell.openPath(logDirectory())
    if (error) throw new Error(error)
  }),

  confirmationDialog: t.procedure.input<{ title: string }>().action(async ({ input }) => {
    const result = await dialog.showMessageBox({
      type: 'warning',
      message: input.title,
      buttons: ['取消', '确认'],
    })
    return !!result.response
  }),

  addRecentDocument: t.procedure.input<{ path: string }>().action(async ({ input }) => {
    app.addRecentDocument(input.path)
  }),
}
