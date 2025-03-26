/* eslint-disable no-console */
import { exec as execCallback } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execCallback)

export default async function installDarWinDeps(context) {
  const { packager, arch } = context
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

  const dependenciesToRemove = {
    x64: ['@ffmpeg-installer/darwin-arm64', '@ffprobe-installer/darwin-arm64'],
    arm64: ['@ffmpeg-installer/darwin-x64', '@ffprobe-installer/darwin-x64'],
  }

  const removeDeps = async (arch) => {
    const deps = dependenciesToRemove[arch]
    for (const dep of deps) {
      try {
        await exec(`pnpm list ${dep}`)
        await exec(`pnpm remove ${dep}`)
      } catch {
        console.log(`${dep} not found, skipping...`)
      }
    }
  }

  const addDeps = async (arch) => {
    const deps = {
      x64: '@ffmpeg-installer/darwin-x64@^4.1.0 @ffprobe-installer/darwin-x64@^5.1.0 -D',
      arm64: '@ffmpeg-installer/darwin-arm64@^4.1.5 @ffprobe-installer/darwin-arm64@^5.0.1 -D',
    }
    await exec(`pnpm add ${deps[arch]}`)
  }

  await removeDeps(currentArch)
  await addDeps(currentArch)

  console.log('Successfully installed dependencies')
}
