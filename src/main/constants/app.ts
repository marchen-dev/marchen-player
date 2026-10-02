import path from 'node:path'

import { app } from 'electron'

export const savePath = () => path.resolve(app.getPath('appData'), app.getName())

export const dbPath = () => path.resolve(savePath(), 'db')
