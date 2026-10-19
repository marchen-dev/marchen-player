import { expect, it } from 'vitest'
import { renderDownloadSection } from './release-body.mjs'

it('下载地址直链到本次版本的全部安装包', () => {
  const section = renderDownloadSection('1.2.3-beta.1')
  const links = [...section.matchAll(/\]\((https:[^)]+)\)/g)].map((match) => match[1])
  const prefix = 'https://github.com/marchen-dev/marchen-player/releases/download/v1.2.3-beta.1/'
  expect(
    links.filter((link) => link.startsWith(prefix)).map((link) => link.slice(prefix.length)),
  ).toEqual([
    'Marchen-1.2.3-beta.1-macos-arm64.dmg',
    'Marchen-1.2.3-beta.1-windows-x64-setup.exe',
    'Marchen-1.2.3-beta.1-linux-amd64.deb',
    'Marchen-1.2.3-beta.1-linux-x86_64.AppImage',
    'Marchen-1.2.3-beta.1-linux-arm64.deb',
    'Marchen-1.2.3-beta.1-linux-arm64.AppImage',
  ])
  expect(links).toHaveLength(6)
})
