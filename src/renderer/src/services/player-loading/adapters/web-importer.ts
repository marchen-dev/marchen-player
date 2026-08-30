/**
 * VideoImporter adapter (Web)：浏览器环境的视频导入
 *
 * Web 环境下使用 URL.createObjectURL 生成播放地址，
 * 通过 calculateFileHash 计算文件哈希。
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
    const initialLease = createObjectUrlLease(file)

    return {
      url: initialLease.url,
      hash,
      size: file.size,
      name: file.name,
      playList: [], // Web 环境无播放列表
      releaseSource: initialLease.release,
      acquireSource: () => createObjectUrlLease(file),
    }
  }

  /**
   * Web 环境不支持从路径导入
   */
  async importFromPath(_path: string): Promise<VideoInfo> {
    throw new Error('Web 环境不支持从路径导入视频')
  }
}

const createObjectUrlLease = (file: File) => {
  const url = URL.createObjectURL(file)
  let released = false
  return {
    url,
    release: () => {
      if (released) return
      released = true
      URL.revokeObjectURL(url)
    },
  }
}
