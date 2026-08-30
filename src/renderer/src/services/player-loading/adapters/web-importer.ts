/**
 * VideoImporter adapter (Web)：浏览器环境的视频导入
 *
 * Web 环境只保留 File 耐久来源（页面生命周期内），播放 Object URL 由 SourceLifecycle 创建。
 * 不支持 importFromPath（Web 无法直接访问文件系统）。
 */

import type { VideoImporter, VideoInfo } from '@marchen/player-loading'
import { calculateFileHash } from '@marchen/shared/lib/calc-file-hash'

export class WebImporter implements VideoImporter {
  /**
   * 从 File 对象导入（浏览器拖拽/点击选择）
   */
  async importFromFile(file: File): Promise<VideoInfo> {
    const hash = await calculateFileHash(file)

    return {
      source: { kind: 'web-file', file, hash, size: file.size, name: file.name },
      hash,
      size: file.size,
      name: file.name,
      playList: [], // Web 环境无播放列表
    }
  }

  /**
   * Web 环境不支持从路径导入
   */
  async importFromPath(_path: string): Promise<VideoInfo> {
    throw new Error('Web 环境不支持从路径导入视频')
  }
}
