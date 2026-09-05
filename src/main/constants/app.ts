import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

export const savePath = () => path.resolve(app.getPath('appData'), app.getName())

export const screenshotsPath = () => path.resolve(savePath(), 'screenshots')
export const subtitlesPath = () => path.resolve(savePath(), 'subtitles')
export const logPath = () => path.resolve(savePath(), 'log')
export const dbPath = () => path.resolve(savePath(), 'db')
export const mediaMetadataCachePath = () => path.resolve(savePath(), 'media-metadata-cache')
export const mediaSegmentCachePath = () => path.resolve(savePath(), 'media-segment-cache')
export const mediaKeyframeCachePath = () => path.resolve(mediaMetadataCachePath(), 'keyframes')
/** @deprecated 媒体分片与可持久化 metadata 已分离，新代码应使用明确路径。 */
export const mediaCachePath = mediaSegmentCachePath

export const createStorageFolder = () => {
  if (!fs.existsSync(screenshotsPath())) {
    fs.mkdirSync(screenshotsPath(), { recursive: true })
  }

  if (!fs.existsSync(subtitlesPath())) {
    fs.mkdirSync(subtitlesPath(), { recursive: true })
  }
}
