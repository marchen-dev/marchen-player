import { getFilePathFromProtocolURL } from '@main/lib/protocols'
import { coverSubtitleToAss } from '@main/lib/utils'
import { defineGroup } from '@marchen/electron-ipc/main'

/**
 * utils 分组：通用工具类 IPC handler
 * 提供文件路径转换、字幕格式转换等工具函数
 */
export const utilsGroup = defineGroup('utils', {
  /** 将 marchen:// 协议 URL 转换为本地文件路径 */
  getFilePathFromProtocolURL: async ({ input }) => {
    return getFilePathFromProtocolURL(input.path)
  },

  /** 将字幕文件（srt/vtt 等）转换为 ASS 格式 */
  coverSubtitleToAss: async ({ input }) => {
    return coverSubtitleToAss(input.path)
  },
})
