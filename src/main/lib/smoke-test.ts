import type { BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { app } from 'electron'

/** 页面加载完成后再等待一段时间，覆盖渲染进程初始化阶段的崩溃 */
const SETTLE_MS = 5000

/**
 * 发行流水线冒烟测试：只有设置 MARCHEN_SMOKE_MARKER 时生效，用户环境不会设置该变量。
 * 主窗口加载完成且 React 根节点已渲染后写出标记文件并以 0 退出；
 * 加载失败、渲染进程退出或根节点为空时以 1 退出，由流水线判定失败。
 */
export function attachSmokeTest(window: BrowserWindow, marker = process.env.MARCHEN_SMOKE_MARKER) {
  if (!marker) return
  let finished = false
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
      }),
    )
    // 直接退出，跳过更新保存屏障等面向用户的退出流程。
    app.exit(ok ? 0 : 1)
  }
  window.webContents.on('render-process-gone', (_event, details) =>
    finish(false, { reason: 'render_process_gone', detail: details.reason }),
  )
  window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame) finish(false, { reason: 'did_fail_load', detail: `${code} ${description}` })
  })
  window.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (window.isDestroyed()) {
        finish(false, { reason: 'window_destroyed' })
        return
      }
      window.webContents
        .executeJavaScript('document.querySelector("#root")?.childElementCount ?? 0')
        .then((count: number) =>
          finish(count > 0, count > 0 ? {} : { reason: 'root_not_rendered' }),
        )
        .catch((error: unknown) => finish(false, { reason: 'probe_failed', detail: String(error) }))
    }, SETTLE_MS)
  })
}
