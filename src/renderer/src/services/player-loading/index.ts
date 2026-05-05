/**
 * Service 组装：创建 PlayerLoadingService 单例
 *
 * 注入所有 adapter 实现，根据运行环境选择 Importer。
 * 导出 service 实例供 React hook 和组件使用。
 */

import { PlayerLoadingService } from '@marchen/player-core'
import { videoAtom } from '@renderer/atoms/player'
import { jotaiStore } from '@renderer/atoms/store'
import { getStorageNS } from '@renderer/lib/ns'
import { isWeb } from '@renderer/lib/utils'

import { DandanplayAPI } from './adapters/dandanplay-api'
import { ElectronImporter } from './adapters/electron-importer'
import { IndexedDBHistoryStore } from './adapters/history-store'
import { IndexedDBCache } from './adapters/indexeddb-cache'
import { WebImporter } from './adapters/web-importer'

// 全局单例（SPA 生命周期内不销毁）
let serviceInstance: PlayerLoadingService | null = null

/**
 * 获取 PlayerLoadingService 单例
 * 首次调用时创建，后续调用返回同一实例
 */
export function getPlayerLoadingService(): PlayerLoadingService {
  if (!serviceInstance) {
    serviceInstance = new PlayerLoadingService({
      api: new DandanplayAPI(),
      cache: new IndexedDBCache(),
      importer: isWeb ? new WebImporter() : new ElectronImporter(),
      history: new IndexedDBHistoryStore(),
      settings: {
        getChConvert: () => {
          // 直接从 localStorage 读取设置（避免循环依赖）
          try {
            const raw = localStorage.getItem(getStorageNS('player'))
            if (raw) {
              const settings = JSON.parse(raw)
              return settings.enableTraditionalToSimplified ? 1 : 0
            }
          } catch {}
          return 0
        },
      },
    })

    // 同步 service state 中的 video 信息到 videoAtom
    // 这样 SettingProvider、Event.tsx 等仍然从 videoAtom 读取 hash 的组件能正常工作
    serviceInstance.state$.subscribe((state) => {
      if ('video' in state && state.video) {
        const current = jotaiStore.get(videoAtom)
        if (current.hash !== state.video.hash || current.url !== state.video.url) {
          jotaiStore.set(videoAtom, {
            url: state.video.url,
            hash: state.video.hash,
            size: state.video.size,
            name: state.video.name,
            playList: state.video.playList,
          })
        }
      }
    })
  }
  return serviceInstance
}

// 导出类型供外部使用
export type { PlayerLoadingService } from '@marchen/player-core'
export {
  type CommentModel,
  type DanmakuEntry,
  type LoadingState,
  type MatchedVideo,
  type StepName,
  type VideoInfo,
  VISIBLE_STEPS,
} from '@marchen/player-core'
