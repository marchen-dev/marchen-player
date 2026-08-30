import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

export const savePath = () => path.resolve(app.getPath('appData'), app.getName())

export const screenshotsPath = () => path.resolve(savePath(), 'screenshots')
export const subtitlesPath = () => path.resolve(savePath(), 'subtitles')
export const logPath = () => path.resolve(savePath(), 'log')
export const dbPath = () => path.resolve(savePath(), 'db')
export const mediaCachePath = () => path.resolve(savePath(), 'media-cache')

export const createStorageFolder = () => {
  if (!fs.existsSync(screenshotsPath())) {
    fs.mkdirSync(screenshotsPath(), { recursive: true })
  }

  if (!fs.existsSync(subtitlesPath())) {
    fs.mkdirSync(subtitlesPath(), { recursive: true })
  }
}
