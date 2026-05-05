/**
 * VideoImporter adapter (Electron)：通过 IPC 获取视频文件信息
 *
 * Electron 环境下，文件信息通过 main 进程的 IPC 接口获取。
 * 包括文件 hash 计算、播放列表获取等。
 */

import type { VideoImporter, VideoInfo } from '@marchen/player-core'
import { MARCHEN_PROTOCOL_PREFIX } from '@marchen/shared/constants/protocol'
import { calculateFileHash } from '@marchen/shared/lib/calc-file-hash'
import { ipcClient } from '@renderer/lib/client'

export class ElectronImporter implements VideoImporter {
  /**
   * 从 File 对象导入（Electron 环境下的拖拽导入）
   * 通过 window.api.showFilePath 获取真实路径，再走 IPC 流程
   */
  async importFromFile(file: File): Promise<VideoInfo> {
    const path = window.api.showFilePath(file)
    const playList = (await ipcClient?.player.getAnimeInSamePath({ path })) ?? []
    const url = `${MARCHEN_PROTOCOL_PREFIX}${path}`
    const hash = await calculateFileHash(file)

    ipcClient?.app.addRecentDocument({ path })

    return {
      url,
      hash,
      size: file.size,
      name: file.name,
      playList,
    }
  }

  /**
   * 从文件路径导入（IPC 菜单打开、历史记录续播、播放列表切换）
   * 通过 IPC 调用 getAnimeDetailByPath 获取文件详情
   */
  async importFromPath(path: string): Promise<VideoInfo> {
    const animeData = await ipcClient?.player.getAnimeDetailByPath({ path })
    if (!animeData?.ok) {
      throw new Error(animeData?.message || '无法读取视频文件')
    }

    const { fileHash, fileName, fileSize, filePath } = animeData
    if (!fileHash || !fileName || !fileSize) {
      throw new Error('无法读取视频文件信息')
    }

    const playList = (await ipcClient?.player.getAnimeInSamePath({ path })) ?? []
    ipcClient?.app.addRecentDocument({ path: filePath })

    return {
      url: filePath,
      hash: fileHash,
      size: fileSize,
      name: fileName,
      playList,
    }
  }
}
