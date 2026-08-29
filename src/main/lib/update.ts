import { getRendererHandlers, updateProgress } from '@main/windows/setting'
import { version } from '@pkg'
import logger from 'electron-log'
import updater from 'electron-updater'

import { parseReleaseNotes, sleep } from './utils'

const { autoUpdater } = updater

export async function autoUpdateInit() {
  // 避免启动代码过多,更新检测延迟1s
  await sleep(1000)
  autoUpdater.logger = logger
  autoUpdater.disableWebInstaller = false
  autoUpdater.autoDownload = false //这个必须写成false，写成true时，我这会报没权限更新，也没清楚什么原因
  autoUpdater.forceDevUpdateConfig = true
  autoUpdater.allowPrerelease = false
  autoUpdater.on('error', (error) => {
    logger.error(['检查更新失败', error])
  })
  //当有可用更新的时候触发。 更新将自动下载。
  autoUpdater.on('update-available', (info) => {
    logger.info('检查到有更新，开始下载新版本')
    logger.info(info)
    autoUpdater.downloadUpdate()
  })
  //当没有可用更新的时候触发。
  autoUpdater.on('update-not-available', (info) => {
    const releaseContent = parseReleaseNotes(info.releaseNotes)
    if (info.version === version) {
      getRendererHandlers()?.getReleaseNotes.send(releaseContent)
    }

    logger.info('没有可用更新')
  })
  // 在应用程序启动时设置差分下载逻辑
  autoUpdater.on('download-progress', async (progress) => {
    logger.info(progress)
    updateProgress({ progress: progress.percent, status: 'downloading' })
  })
  //在更新下载完成的时候触发。
  autoUpdater.on('update-downloaded', (res) => {
    logger.info('下载完毕！提示安装更新')
    logger.info(res)
    updateProgress({ progress: 100, status: 'installing' })
  })

  // 每次启动自动检查更新。unpacked 产物没有 app-update.yml，
  // electron-updater 会拒绝 Promise；这里显式收口，避免形成未处理异常影响主进程。
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    // error 事件已统一记录；这里只负责消费 Promise 拒绝。
  }
}
