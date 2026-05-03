import fs from 'node:fs'
import path from 'node:path'

import { parseBilibiliDanmaku } from '@main/lib/danmaku'
import FFmpeg from '@main/lib/ffmpeg'
import { getFilePathFromProtocolURL } from '@main/lib/protocols'
import { coverSubtitleToAss } from '@main/lib/utils'
import { showFileSelectionDialog } from '@main/modules/showDialog'
import { defineGroup } from '@marchen/electron-ipc/main'
import { MARCHEN_PROTOCOL_PREFIX } from '@marchen/shared/constants/protocol'
import { calculateFileHashByBuffer } from '@marchen/shared/lib/calc-file-hash'
import { dialog } from 'electron'
import naturalCompare from 'string-natural-compare'

/** 防止重复打开文件选择对话框的标志位 */
let isDialogOpen = false

/**
 * player 分组：播放器相关的 IPC handler
 * 包含视频文件操作、字幕处理、弹幕导入等功能
 */
export const playerGroup = defineGroup('player', {
  /** 显示警告对话框（同步阻塞式） */
  showWarningDialog: async ({ input }) =>
    dialog.showMessageBoxSync({
      message: input.title,
      detail: input.content,
      type: 'warning',
    }),

  /**
   * 根据文件路径获取视频详情
   * 包括文件名、大小、MD5 哈希（用于弹幕匹配）和协议 URL
   */
  getAnimeDetailByPath: async ({ input }) => {
    try {
      let animePath = input.path
      if (animePath.startsWith(MARCHEN_PROTOCOL_PREFIX)) {
        animePath = getFilePathFromProtocolURL(animePath)
      }
      if (!animePath || !fs.existsSync(animePath)) {
        return {
          ok: 0,
          message: '视频文件可能被移动，无法继续播放',
        }
      }
      const stats = fs.statSync(animePath)
      const fileName = path.basename(animePath)
      const fileSize = stats.size

      // 读取文件前 16MB 用于计算哈希
      const bufferSize = Math.min(fileSize, 16 * 1024 * 1024)
      const buffer = Buffer.alloc(bufferSize)
      const fd = fs.openSync(animePath, 'r')
      fs.readSync(fd, buffer, 0, bufferSize, 0)
      fs.closeSync(fd)

      const fileHash = await calculateFileHashByBuffer(buffer)
      return {
        ok: 1,
        fileSize,
        fileName,
        fileHash,
        filePath: `${MARCHEN_PROTOCOL_PREFIX}${animePath}`,
      }
    } catch {
      return {
        ok: 0,
        message: '获取视频信息失败',
      }
    }
  },

  /** 使用 FFmpeg 截取视频指定时间点的帧，返回 base64 图片 */
  grabFrame: async ({ input }) => {
    let filePath = input.path
    if (filePath.startsWith(MARCHEN_PROTOCOL_PREFIX)) {
      filePath = getFilePathFromProtocolURL(filePath)
    }
    const ffmpeg = new FFmpeg(filePath)
    const base64Image = (await ffmpeg.grabFrame(input.time)) as string
    return base64Image
  },

  /** 打开文件选择对话框，让用户选择视频文件（mp4/mkv） */
  importAnime: async () => {
    if (isDialogOpen) {
      return
    }

    isDialogOpen = true

    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: '视频文件', extensions: ['mp4', 'mkv'] }],
      })

      if (result.canceled) {
        return
      }

      const selectedFilePath = result.filePaths[0]
      const selectedFileExtname = path.extname(selectedFilePath)

      if (selectedFileExtname !== '.mp4' && selectedFileExtname !== '.mkv') {
        return
      }

      return selectedFilePath
    } finally {
      isDialogOpen = false
    }
  },

  /** 获取同目录下同格式的视频文件列表，用于播放列表 */
  getAnimeInSamePath: async ({ input }) => {
    let selectedFilePath = input.path
    if (selectedFilePath.startsWith(MARCHEN_PROTOCOL_PREFIX)) {
      selectedFilePath = getFilePathFromProtocolURL(selectedFilePath)
    }
    const selectedFileExtname = path.extname(selectedFilePath)
    if (selectedFileExtname !== '.mp4' && selectedFileExtname !== '.mkv') {
      return []
    }

    const selectedFileDirname = path.dirname(selectedFilePath)

    // 读取路径下所有同后缀的文件
    const fileNameWithSameSuffix = fs
      .readdirSync(selectedFileDirname)
      .filter((file) => path.extname(file).toLowerCase() === selectedFileExtname)

    const filePathWithSameSuffix = fileNameWithSameSuffix.map((fileName) =>
      path.join(selectedFileDirname, fileName),
    )
    // 按文件名自然排序
    filePathWithSameSuffix.sort(naturalCompare)

    const playList = filePathWithSameSuffix.map((filePath) => ({
      urlWithPrefix: `${MARCHEN_PROTOCOL_PREFIX}${filePath}`,
      name: path.basename(filePath),
    }))

    return playList
  },

  /** 打开字幕文件选择对话框，并将字幕转换为 ASS 格式 */
  importSubtitle: async () => {
    const filePath = await showFileSelectionDialog({
      filters: [{ name: '字幕文件', extensions: ['srt', 'ass', 'ssa', 'vtt'] }],
    })
    if (!filePath) {
      return
    }
    return coverSubtitleToAss(filePath)
  },

  /** 从视频文件中提取内嵌字幕轨道信息 */
  getSubtitlesIntroFromAnime: async ({ input }) => {
    const ffmpeg = new FFmpeg(getFilePathFromProtocolURL(input.path))
    const subtitles = await ffmpeg.getSubtitlesIntroFromAnime()
    return subtitles
  },

  /** 从视频文件中提取指定索引的字幕内容 */
  getSubtitlesBody: async ({ input }) => {
    try {
      const ffmpeg = new FFmpeg(getFilePathFromProtocolURL(input.path))
      const data = await ffmpeg.extractSubtitles(input.index)
      return {
        ok: 1,
        data,
      }
    } catch (error: any) {
      return {
        ok: 0,
        message: error?.message || '',
      }
    }
  },

  /** 根据视频文件名匹配同目录下的同名字幕文件 */
  matchSubtitleFile: async ({ input }) => {
    const filePath = getFilePathFromProtocolURL(input.path)
    if (!fs.existsSync(filePath)) {
      return
    }
    const filePrefix = path.basename(filePath).split('.')[0]
    const directoryPath = path.dirname(filePath)

    const matchedFiles = fs
      .readdirSync(path.dirname(filePath))
      .filter((file) => file.startsWith(filePrefix) && file !== path.basename(filePath))
      .map((file) => ({
        fileName: file,
        filePath: path.join(directoryPath, file),
      }))

    return matchedFiles
  },

  /** 打开弹幕文件选择对话框，解析 B 站弹幕格式（xml/json） */
  immportDanmakuFile: async () => {
    if (isDialogOpen) {
      return
    }

    isDialogOpen = true
    try {
      const filePath = await showFileSelectionDialog({
        filters: [{ name: '弹幕文件', extensions: ['xml', 'json'] }],
      })
      if (!filePath) {
        return
      }
      const extName = path.extname(filePath).toLowerCase()
      if (extName !== '.xml' && extName !== '.json') {
        return {
          ok: 0,
          message: '请选择正确的弹幕文件',
        }
      }
      const fileData = fs.readFileSync(filePath, 'utf-8')
      return {
        ok: 1,
        data: {
          danmaku: await parseBilibiliDanmaku({
            fileData,
            type: extName,
          }),
          source: filePath,
        },
      }
    } catch {
      return {
        ok: 0,
        message: '解析弹幕文件失败',
      }
    } finally {
      isDialogOpen = false
    }
  },
})
