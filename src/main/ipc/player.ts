import fs from 'node:fs'
import path from 'node:path'
import { parseBilibiliDanmaku } from '@main/lib/danmaku'

import { createMediaLease, releaseMediaLease } from '@main/lib/media-protocol'
import { showFileSelectionDialog } from '@main/modules/showDialog'
import { tipc } from '@marchen/electron-ipc/main'
import { calculateFileHashByBuffer } from '@marchen/shared/lib/calc-file-hash'
import { dialog } from 'electron'
import naturalCompare from 'string-natural-compare'

const t = tipc.create()

let isDialogOpen = false

export const playerGroup = {
  createMediaLease: t.procedure
    .input<{ path: string }>()
    .action(({ input, context }) => createMediaLease(input.path, context.sender)),
  releaseMediaLease: t.procedure
    .input<{ id: string }>()
    .action(async ({ input, context }) => releaseMediaLease(input.id, context.sender.id)),
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
      const animePath = input.path
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
        rawPath: animePath,
      }
    } catch {
      return {
        ok: 0,
        message: '获取视频信息失败',
      }
    }
  }),

  importAnime: t.procedure.action(async () => {
    if (isDialogOpen) {
      return
    }

    isDialogOpen = true

    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '视频文件', extensions: ['mp4', 'mkv'] }],
      })

      if (result.canceled) {
        return
      }

      return result.filePaths.filter((file) =>
        ['.mp4', '.mkv'].includes(path.extname(file).toLowerCase()),
      )
    } finally {
      isDialogOpen = false
    }
  }),

  getAnimeInSamePath: t.procedure.input<{ path: string }>().action(async ({ input }) => {
    const selectedFilePath = input.path
    const selectedFileExtname = path.extname(selectedFilePath)
    if (selectedFileExtname !== '.mp4' && selectedFileExtname !== '.mkv') {
      return []
    }

    const selectedFileDirname = path.dirname(selectedFilePath)

    let fileNameWithSameSuffix: string[]
    try {
      fileNameWithSameSuffix = fs
        .readdirSync(selectedFileDirname)
        .filter((file) => path.extname(file).toLowerCase() === selectedFileExtname)
    } catch {
      // macOS TCC 权限拒绝等情况，降级为只返回当前文件
      return [
        {
          path: selectedFilePath,
          name: path.basename(selectedFilePath),
        },
      ]
    }

    const filePathWithSameSuffix = fileNameWithSameSuffix.map((fileName) =>
      path.join(selectedFileDirname, fileName),
    )
    filePathWithSameSuffix.sort(naturalCompare)

    const playList = filePathWithSameSuffix.map((filePath) => ({
      path: filePath,
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
    return { fileName: path.basename(filePath), filePath }
  }),

  readSubtitleText: t.procedure.input<{ path: string }>().action(async ({ input }) => {
    try {
      const filePath = input.path
      const extension = path.extname(filePath).toLowerCase()
      if (!['.ass', '.ssa', '.srt', '.vtt'].includes(extension)) {
        return { ok: 0, message: '字幕文件格式不受支持' }
      }
      const stats = fs.statSync(filePath)
      if (!stats.isFile() || stats.size > 8 * 1024 * 1024) {
        return { ok: 0, message: '字幕文件无效或过大' }
      }
      return { ok: 1, data: fs.readFileSync(filePath, 'utf-8') }
    } catch (error) {
      return {
        ok: 0,
        message: error instanceof Error ? error.message : '字幕文件读取失败',
      }
    }
  }),

  matchSubtitleFile: t.procedure.input<{ path: string }>().action(async ({ input }) => {
    const filePath = input.path
    if (!fs.existsSync(filePath)) {
      return
    }
    const filePrefix = path.basename(filePath).split('.')[0]
    const directoryPath = path.dirname(filePath)

    const matchedFiles = fs
      .readdirSync(path.dirname(filePath))
      .filter(
        (file) =>
          file.startsWith(filePrefix) &&
          ['.ass', '.ssa', '.srt', '.vtt'].includes(path.extname(file).toLowerCase()),
      )
      .map((file) => ({
        fileName: file,
        filePath: path.join(directoryPath, file),
      }))

    return matchedFiles
  }),

  immportDanmakuFile: t.procedure.action(async () => {
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
  }),
}
