import { expect, it } from 'vitest'
import {
  debArchitecture,
  debVersion,
  elfArch,
  isLoadableNativeModule,
  parseDesktopEntry,
  verifyDesktopEntry,
  verifyLinuxMetadata,
} from './linux-package.mjs'

function elf(machine, { bits = 2 } = {}) {
  const buffer = Buffer.alloc(64)
  buffer.writeUInt32BE(0x7F454C46, 0)
  buffer[4] = bits
  buffer[5] = 1
  buffer.writeUInt16LE(machine, 18)
  return buffer
}

it('按 ELF 头识别 x64 / arm64，拒绝非 ELF 与 32 位', () => {
  expect(elfArch(elf(0x3E))).toBe('x64')
  expect(elfArch(elf(0xB7))).toBe('arm64')
  expect(elfArch(elf(0x28))).toBe('unknown')
  expect(elfArch(elf(0x3E, { bits: 1 }))).toBeNull()
  expect(elfArch(Buffer.from('MZ not elf at all'))).toBeNull()
})

it('deb 架构与版本命名', () => {
  expect(debArchitecture('x64')).toBe('amd64')
  expect(debArchitecture('arm64')).toBe('arm64')
  expect(debVersion('1.1.0-alpha.2')).toBe('1.1.0~alpha.2')
  expect(debVersion('1.1.0')).toBe('1.1.0')
})

const mime =
  'video/mp4;video/x-m4v;video/quicktime;video/x-matroska;video/x-matroska-3d;video/webm;video/mp2t;application/x-bittorrent;'
const desktop = (exec, extra = '') => `[Desktop Entry]
Name=Marchen
Exec=${exec}
Terminal=false
Type=Application
Icon=marchen
StartupWMClass=marchen
MimeType=${mime}
${extra}
[Desktop Action Other]
Exec=ignored`

it('解析 .desktop 只读取 Desktop Entry 段', () => {
  const entry = parseDesktopEntry(desktop('AppRun %U'))
  expect(entry.Exec).toBe('AppRun %U')
  expect(entry.MimeType).toBe(mime)
})

it.each([
  ['appimage', 'AppRun %U'],
  ['deb', '/opt/Marchen/marchen %U'],
])('%s 桌面入口合法', (format, exec) => {
  expect(() =>
    verifyDesktopEntry(parseDesktopEntry(desktop(exec)), { executable: 'marchen', format }),
  ).not.toThrow()
})

it('桌面入口拒绝写死无沙箱、缺少 %U、MIME 或窗口关联', () => {
  const check =
    (text, format = 'appimage') =>
    () =>
      verifyDesktopEntry(parseDesktopEntry(text), { executable: 'marchen', format })
  expect(check(desktop('AppRun --no-sandbox %U'))).toThrow('--no-sandbox')
  expect(check(desktop('AppRun'))).toThrow('%U')
  expect(check(desktop('/opt/Marchen/other %U'), 'deb')).toThrow('入口错误')
  expect(check(desktop('AppRun %U').replace('application/x-bittorrent;', ''))).toThrow(
    'application/x-bittorrent',
  )
  expect(
    check(desktop('AppRun %U').replace('StartupWMClass=marchen', 'StartupWMClass=Marchen')),
  ).toThrow('StartupWMClass')
})

it('更新元数据必须与 AppImage 一致', () => {
  const appImage = { name: 'Marchen-1.1.0-arm64.AppImage', sha512: 'abc', size: 3 }
  const metadata = {
    version: '1.1.0',
    path: appImage.name,
    files: [{ url: appImage.name, sha512: 'abc', size: 3 }],
  }
  expect(() => verifyLinuxMetadata(metadata, { version: '1.1.0', appImage })).not.toThrow()
  expect(() => verifyLinuxMetadata(metadata, { version: '1.1.1', appImage })).toThrow('版本')
  expect(() =>
    verifyLinuxMetadata(metadata, { version: '1.1.0', appImage: { ...appImage, sha512: 'x' } }),
  ).toThrow('校验值')
  expect(() =>
    verifyLinuxMetadata(
      { ...metadata, files: [{ ...metadata.files[0], url: 'Marchen-1.1.0-x86_64.AppImage' }] },
      { version: '1.1.0', appImage },
    ),
  ).toThrow('缺少')
})

it('只校验运行时会加载的原生模块', () => {
  const base = '/opt/Marchen/resources/app.asar.unpacked/node_modules'
  expect(isLoadableNativeModule(`${base}/utp-native/build/Release/utp_native.node`, 'arm64')).toBe(
    true,
  )
  expect(isLoadableNativeModule(`${base}/bufferutil/prebuilds/linux-arm64/b.node`, 'arm64')).toBe(
    true,
  )
  expect(isLoadableNativeModule(`${base}/bufferutil/prebuilds/linux-x64/b.node`, 'arm64')).toBe(
    false,
  )
  expect(isLoadableNativeModule(`${base}/bufferutil/prebuilds/darwin-arm64/b.node`, 'arm64')).toBe(
    false,
  )
  expect(isLoadableNativeModule(`${base}/bufferutil/prebuilds/linux-x64/b.node`, 'x64')).toBe(true)
})
