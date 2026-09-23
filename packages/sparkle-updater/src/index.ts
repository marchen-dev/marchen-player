import { createRequire } from 'node:module'

export type SparkleEvent = 'prepare-install' | 'will-relaunch' | 'error' | 'notice-deferred'
export interface SparkleBridge {
  initialize: (onEvent: (event: SparkleEvent) => void) => void
  automaticChecks: (enabled?: boolean) => boolean
  checkInBackground: () => void
  checkForUpdates: () => void
  resumeInstall: () => void
  setPlaying: (playing: boolean) => void
}

// 路径由主进程打包适配器传入，禁止从 renderer 接收任意原生模块路径。
export function loadSparkleBridge(
  addonPath: string,
): { available: true; bridge: SparkleBridge } | { available: false; reason: string } {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    return { available: false, reason: '仅支持 macOS ARM64' }
  }
  try {
    const bridge: unknown = createRequire(import.meta.url)(addonPath)
    if (
      !bridge ||
      typeof bridge !== 'object' ||
      ![
        'initialize',
        'checkForUpdates',
        'resumeInstall',
        'setPlaying',
        'automaticChecks',
        'checkInBackground',
      ].every((key) => typeof Reflect.get(bridge, key) === 'function')
    )
      throw new Error('原生更新模块接口不完整')
    return { available: true, bridge: bridge as SparkleBridge }
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : '原生模块加载失败' }
  }
}
