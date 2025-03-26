/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'

import fixLinuxPermissions from './fix-linux-permissions.js'

export default async function cleanDeps(context) {
  await fixLinuxPermissions(context)
  const { packager, arch, appOutDir } = context
  const platform = packager.platform.nodeName
  if (platform !== 'darwin') {
    return
  }
  const archMap = {
    1: 'x64',
    3: 'arm64',
  }
  const currentArch = archMap[arch]

  if (!currentArch) {
    return
  }

  const unpackedPath = path.resolve(
    appOutDir,
    'Marchen.app',
    'Contents',
    'Resources',
    'app.asar.unpacked',
    'node_modules',
  )
  if (!fs.existsSync(unpackedPath)) {
    return
  }

  const ffmpegPath = path.resolve(unpackedPath, '@ffmpeg-installer')
  const ffprobePath = path.resolve(unpackedPath, '@ffprobe-installer')

  if (!fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
    return
  }

  const removeUnusedArch = (basePath, unusedArch) => {
    const unusedPath = path.resolve(basePath, `darwin-${unusedArch}`)
    if (fs.existsSync(unusedPath)) {
      fs.rmSync(unusedPath, { recursive: true })
    }
  }

  if (currentArch === 'x64') {
    removeUnusedArch(ffmpegPath, 'arm64')
    removeUnusedArch(ffprobePath, 'arm64')
  } else if (currentArch === 'arm64') {
    removeUnusedArch(ffmpegPath, 'x64')
    removeUnusedArch(ffprobePath, 'x64')
  }
  console.log('Cleaned unused arch dependencies.')
}
