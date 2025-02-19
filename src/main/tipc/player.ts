import fs from 'node:fs'
import path from 'node:path'

import { MARCHEN_PROTOCOL_PREFIX } from '@main/constants/protocol'
import { parseBilibiliDanmaku } from '@main/lib/danmaku'
import FFmpeg from '@main/lib/ffmpeg'
import { getFilePathFromProtocolURL } from '@main/lib/protocols'
import { coverSubtitleToAss } from '@main/lib/utils'
import { showFileSelectionDialog } from '@main/modules/showDialog'
import { calculateFileHashByBuffer } from '@renderer/lib/calc-file-hash'
import { dialog } from 'electron'
import naturalCompare from 'string-natural-compare'

import { t } from './_instance'

let isDialogOpen = false

export const playerRoute = {
  showWarningDialog: t.procedure
    .input<{ title: string; content: string }>()
    .action(async ({ input }) =>
      dialog.showMessageBoxSync({
        message: input.title,
        detail: input.content,
        type: 'warning',
      }),
    ),
  getAnimeDetailByPath: t.procedure.input<{ path: string }>().action(async ({ input }) => {
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
  }),
  grabFrame: t.procedure.input<{ path: string; time: string }>().action(async ({ input }) => {
    let filePath = input.path
    if (filePath.startsWith(MARCHEN_PROTOCOL_PREFIX)) {
      filePath = getFilePathFromProtocolURL(filePath)
    }
    const ffmpeg = new FFmpeg(filePath)
    const base64Image = (await ffmpeg.grabFrame(input.time)) as string
    return base64Image
  }),
  importAnime: t.procedure.action(async () => {
    // 确保不重复打开对话框
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
  }),
  getAnimeInSamePath: t.procedure.input<{ path: string }>().action(async ({ input }) => {
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
  }),
  importSubtitle: t.procedure.action(async () => {
    const filePath = await showFileSelectionDialog({
      filters: [{ name: '字幕文件', extensions: ['srt', 'ass', 'ssa', 'vtt'] }],
    })
    if (!filePath) {
      return
    }
    return coverSubtitleToAss(filePath)
  }),
  getSubtitlesIntroFromAnime: t.procedure.input<{ path: string }>().action(async ({ input }) => {
    const ffmpeg = new FFmpeg(getFilePathFromProtocolURL(input.path))
    const subtitles = await ffmpeg.getSubtitlesIntroFromAnime()
    return subtitles
  }),
  getSubtitlesBody: t.procedure
    .input<{ path: string; index: number }>()
    .action(async ({ input }) => {
      const ffmpeg = new FFmpeg(getFilePathFromProtocolURL(input.path))
      return ffmpeg.extractSubtitles(input.index)
    }),
  matchSubtitleFile: t.procedure.input<{ path: string }>().action(async ({ input }) => {
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
  }),
  immportDanmakuFile: t.procedure.action(async () => {
    // 确保不重复打开对话框
    if (isDialogOpen) {
      return
    }

    isDialogOpen = true
    try {
      const filePath = await showFileSelectionDialog({
        filters: [{ name: '弹幕文件', extensions: ['xml', 'json'] }],
      })
      if (!filePath) {
        return {
          ok: 0,
          message: '请选择弹幕文件',
        }
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
  }),
}
