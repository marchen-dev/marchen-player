const { appendFileSync, mkdirSync, existsSync } = require('node:fs')
const { join } = require('node:path')
const { app, BrowserWindow, Menu } = require('electron')
// 隔离原型的全部状态，禁止访问 Marchen 正式历史和更新源。
const base = join(app.getPath('appData'), 'MarchenSparklePrototype')
mkdirSync(base, { recursive: true })
app.setPath('userData', base)
const log = (event) =>
  appendFileSync(
    join(base, 'events.jsonl'),
    `${JSON.stringify({
      event,
      version: app.getVersion(),
      pid: process.pid,
      time: new Date().toISOString(),
    })  }\n`,
  )
let bridge
app.whenReady().then(() => {
  log('started')
  bridge = require(join(process.resourcesPath, 'sparkle.node'))
  bridge.initialize((event) => {
    log(event)
    if (event === 'prepare-install') {
      // 以文件标记模拟保存超时，验证旧进程继续运行，不伪造保存成功。
      if (existsSync(join(base, 'fail-save'))) {
        log('save-failed')
        return
      }
      setTimeout(() => {
        log('saved')
        bridge.resumeInstall()
      }, 500)
    }
  })
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: '更新原型',
        submenu: [
          { label: '检查更新', click: () => bridge.checkForUpdates() },
          { label: '后台检查', click: () => bridge.checkInBackground() },
          { label: '模拟正在播放', click: () => bridge.setPlaying(true) },
          { label: '模拟停止播放', click: () => bridge.setPlaying(false) },
          {
            label: '重试保存并安装',
            click: () => {
              log('saved-after-retry')
              bridge.resumeInstall()
            },
          },
          { role: 'quit' },
        ],
      },
    ]),
  )
  const win = new BrowserWindow({
    width: 560,
    height: 260,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  win.loadURL(
    `data:text/html;charset=utf-8,${ 
      encodeURIComponent(
        `<html lang="zh"><body style="font:18px system-ui;padding:28px"><h2>Marchen 更新原型 ${app.getVersion()}</h2><p>测试应用，与正式播放器隔离。</p><p>通过应用菜单「检查更新」打开 Sparkle 原生窗口。</p></body></html>`,
      )}`,
  )
})
app.on('before-quit', () => log('before-quit'))
app.on('will-quit', () => log('will-quit'))
