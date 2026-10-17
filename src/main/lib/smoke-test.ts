import type { BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { app } from 'electron'

/** 轮询 React 根节点的间隔与上限；CI 软件渲染下首屏可能明显慢于桌面环境 */
const POLL_MS = 500
const TIMEOUT_MS = 30_000
/** 首屏渲染后再稳定一段时间，覆盖挂载后立即崩溃的情况 */
const SETTLE_MS = 2000
/** 失败诊断最多带回的控制台错误条数 */
const MAX_CONSOLE_ERRORS = 20

// 根节点子元素数与 main.tsx 中的启动阶段标记，失败时用于判断卡在哪一步。
const PROBE = `JSON.stringify({
  count: document.querySelector('#root')?.childElementCount ?? 0,
  marks: performance.getEntriesByType('mark').map((mark) => mark.name),
})`

/**
 * 发行流水线冒烟测试：只有设置 MARCHEN_SMOKE_MARKER 时生效，用户环境不会设置该变量。
 * 主窗口加载完成后轮询 React 根节点，渲染出内容并稳定后写出标记文件并以 0 退出；
 * 加载失败、渲染进程退出或超时未渲染时以 1 退出，并附带控制台错误与启动阶段标记。
 */
export function attachSmokeTest(window: BrowserWindow, marker = process.env.MARCHEN_SMOKE_MARKER) {
  if (!marker) return
  let finished = false
  const consoleErrors: string[] = []
  const finish = (ok: boolean, detail: Record<string, unknown>) => {
    if (finished) return
    finished = true
    writeFileSync(
      marker,
      JSON.stringify({
        ok,
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        ...detail,
        ...(ok ? {} : { consoleErrors }),
      }),
    )
    // 直接退出，跳过更新保存屏障等面向用户的退出流程。
    app.exit(ok ? 0 : 1)
  }
  window.webContents.on('console-message', (event) => {
    if (event.level === 'error' && consoleErrors.length < MAX_CONSOLE_ERRORS)
      consoleErrors.push(`${event.message} (${event.sourceId}:${event.lineNumber})`)
  })
  window.webContents.on('render-process-gone', (_event, details) =>
    finish(false, { reason: 'render_process_gone', detail: details.reason }),
  )
  window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame) finish(false, { reason: 'did_fail_load', detail: `${code} ${description}` })
  })
  window.webContents.once('did-finish-load', () => {
    const startedAt = Date.now()
    let renderedAt: number | undefined
    const poll = () => {
      if (finished) return
      if (window.isDestroyed()) {
        finish(false, { reason: 'window_destroyed' })
        return
      }
      window.webContents
        .executeJavaScript(PROBE)
        .then((raw: string) => {
          const { count, marks } = JSON.parse(raw) as { count: number; marks: string[] }
          const elapsed = Date.now() - startedAt
          if (count > 0) {
            renderedAt ??= elapsed
            if (elapsed - renderedAt >= SETTLE_MS) {
              finish(true, { firstRenderMs: renderedAt, marks })
              return
            }
          } else if (elapsed >= TIMEOUT_MS) {
            finish(false, { reason: 'root_not_rendered', waitedMs: elapsed, marks })
            return
          }
          setTimeout(poll, POLL_MS)
        })
        .catch((error: unknown) => finish(false, { reason: 'probe_failed', detail: String(error) }))
    }
    poll()
  })
}
