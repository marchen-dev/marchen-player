import os from 'node:os'

export const mode = process.env.NODE_ENV
export const isDev = mode === 'development'

const { platform } = process
export const isMacOS = platform === 'darwin'

export const isWindows = platform === 'win32'

export const isLinux = platform === 'linux'
export const isWindows11 = isWindows && os.version().startsWith('Windows 11')