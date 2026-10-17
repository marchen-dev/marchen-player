import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false } }))

const { resolvePackageType } = await import('./package-type')

describe('桌面安装形态', () => {
  it.each([
    [{ isPackaged: false, platform: 'linux' as const }, 'unpackaged'],
    [{ isPackaged: true, platform: 'darwin' as const }, 'mac-app'],
    [{ isPackaged: true, platform: 'win32' as const }, 'nsis'],
    [{ isPackaged: true, platform: 'linux' as const, appImage: '/a/Marchen.AppImage' }, 'appimage'],
    [{ isPackaged: true, platform: 'linux' as const }, 'deb'],
    [{ isPackaged: true, platform: 'freebsd' as const }, 'unknown'],
  ])('%o → %s', (options, expected) => {
    expect(resolvePackageType(options)).toBe(expected)
  })
})
