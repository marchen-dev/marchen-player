import { appendFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  linuxArtifactNames,
  macArtifactNames,
  RELEASE_REPOSITORY,
  windowsSetupName,
} from '../../packages/shared/src/update-policy.ts'

/**
 * GitHub Release 正文末尾的「下载地址」，按平台直链到本次版本的安装包。
 * 只追加到 Release 正文：docs/releases/<版本>.md 同时作为应用内更新说明，不能混入下载链接。
 */
export function renderDownloadSection(version) {
  const url = (name) =>
    `https://github.com/${RELEASE_REPOSITORY}/releases/download/v${version}/${name}`
  const link = (label, name) => `[${label}](${url(name)})`
  const x64 = linuxArtifactNames(version, 'x64')
  const arm64 = linuxArtifactNames(version, 'arm64')
  return `
## 下载地址

### macOS 13+

- ${link('Apple Silicon（.dmg）', macArtifactNames(version).dmg)}

### Windows

- ${link('x64 安装包', windowsSetupName(version))}

### Linux

- x64：${link('.deb（Ubuntu / Debian）', x64.deb)} | ${link('.AppImage', x64.appImage)}
- arm64：${link('.deb', arm64.deb)} | ${link('.AppImage', arm64.appImage)}
`
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const version = JSON.parse(await readFile('package.json', 'utf8')).version
  await appendFile(resolve(process.argv[2] || 'release-notes.md'), renderDownloadSection(version))
}
