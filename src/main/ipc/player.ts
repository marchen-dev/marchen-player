import type { SubtitleFailureReason } from '@marchen/shared/media'
import fs from 'node:fs'
import path from 'node:path'
import {
  createMediaLease,
  createRemoteMediaLease,
  getRemoteTransfer,
  releaseMediaLease,
} from '@main/lib/media-protocol'

import { showFileSelectionDialog } from '@main/modules/showDialog'
import { tipc } from '@marchen/electron-ipc/main'
import { calculateFileHashByBuffer } from '@marchen/shared/lib/calc-file-hash'
import { isVideoFile, VIDEO_EXTENSIONS } from '@marchen/shared/media'
import { dialog } from 'electron'
import naturalCompare from 'string-natural-compare'
import { t as translate } from '../lib/i18n'
import { getDownloads } from '../services/downloads/service'

const t = tipc.create()

let isDialogOpen = false

export const playerGroup = {
  createRemoteMediaLease: t.procedure
    .input<{ url: string; id: string }>()
    .action(({ input, context }) => createRemoteMediaLease(input.url, input.id, context.sender)),
  remoteTransfer: t.procedure
    .input<{ id: string }>()
    .action(async ({ input, context }) => getRemoteTransfer(input.id, context.sender.id)),
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
      if (!(await getDownloads().available(animePath)))
        return { ok: 0, code: 'downloads.not_finished', message: '文件尚未下载完成或正在校验' }
      if (!animePath || !fs.existsSync(animePath)) {
        return {
          ok: 0,
          code: 'videoImport.file_moved',
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
        code: 'videoImport.info_failed',
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
        filters: [{ name: translate('main:fileDialog.video'), extensions: [...VIDEO_EXTENSIONS] }],
      })

      if (result.canceled) {
        return
      }

      return result.filePaths.filter(isVideoFile)
    } finally {
      isDialogOpen = false
    }
  }),

  getAnimeInSamePath: t.procedure.input<{ path: string }>().action(async ({ input }) => {
    const selectedFilePath = input.path
    const selectedFileExtname = path.extname(selectedFilePath).toLowerCase()
    if (!isVideoFile(selectedFilePath)) {
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

    const available = await Promise.all(playList.map((item) => getDownloads().available(item.path)))
    return playList.filter((_, index) => available[index])
  }),

  importSubtitle: t.procedure.action(async () => {
    const filePath = await showFileSelectionDialog({
      filters: [
        {
          name: translate('main:fileDialog.subtitle'),
          extensions: ['srt', 'ass', 'ssa', 'vtt'],
        },
      ],
    })
    if (!filePath) {
      return
    }
    return { fileName: path.basename(filePath), filePath }
  }),

  readSubtitleText: t.procedure.input<{ path: string }>().action(async ({ input }) => {
    // 失败时附带低基数 reason，renderer 只上报原因、不上报含路径的 message。
    // reason 同时是页面取文案用的错误码（errors:subtitle.<reason>）；message 是留给日志的中文说明
    const fail = (failure: { code: SubtitleFailureReason; message: string }) =>
      ({ ok: 0, reason: failure.code, message: failure.message }) as const
    try {
      const filePath = input.path
      if (!(await getDownloads().available(filePath)))
        return fail({ code: 'not_downloaded', message: '字幕尚未下载完成' })
      const extension = path.extname(filePath).toLowerCase()
      if (!['.ass', '.ssa', '.srt', '.vtt'].includes(extension)) {
        return fail({ code: 'unsupported_format', message: '字幕文件格式不受支持' })
      }
      const stats = fs.statSync(filePath)
      if (!stats.isFile()) return fail({ code: 'read_failed', message: '字幕文件无效' })
      if (stats.size > 8 * 1024 * 1024) return fail({ code: 'too_large', message: '字幕文件过大' })
      return { ok: 1, data: fs.readFileSync(filePath, 'utf-8') } as const
    } catch (error) {
      return fail({
        code: 'read_failed',
        message: error instanceof Error ? error.message : '字幕文件读取失败',
      })
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

    const available = await Promise.all(
      matchedFiles.map((item) => getDownloads().available(item.filePath)),
    )
    return matchedFiles.filter((_, index) => available[index])
  }),
}
