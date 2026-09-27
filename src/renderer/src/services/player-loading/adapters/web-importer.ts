import type { VideoImporter, VideoInfo } from '@marchen/player-loading'
import { calculateFileHash } from '@marchen/shared/lib/calc-file-hash'
/**
 * VideoImporter adapter (Web)：浏览器环境的视频导入
 *
 * Web 环境只保留 File 耐久来源（页面生命周期内），播放 Object URL 由 SourceLifecycle 创建。
 * 不支持 importFromPath（Web 无法直接访问文件系统）。
 */

import { rememberWebFile } from '../file-playlist'

export class WebImporter implements VideoImporter {
  async importFromUrl(): Promise<VideoInfo> {
    throw new Error('网页版不支持远程视频，请使用桌面版')
  }
  /**
   * 从 File 对象导入（浏览器拖拽/点击选择）
   */
  async importFromFile(file: File): Promise<VideoInfo> {
    const hash = await calculateFileHash(file)
    rememberWebFile(file, hash)

    return {
      source: { kind: 'web-file', file, hash, size: file.size, name: file.name },
      hash,
      size: file.size,
      name: file.name,
      playList: [], // 文件列表由 renderer 的页面授权集合持有
    }
  }

  /**
   * Web 环境不支持从路径导入
   */
  async importFromPath(_path: string): Promise<VideoInfo> {
    throw new Error('Web 环境不支持从路径导入视频')
  }
}
