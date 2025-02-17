import type { ReadStream } from 'node:fs'
import fs, { createReadStream, statSync } from 'node:fs'
import path from 'node:path'

import { MARCHEN_PROTOCOL } from '@main/constants/protocol'

import { isWindows } from './env'
import { fromFilename } from './mime-utils'

export const handleCustomProtocol = (filePath: string, request: Request) => {
  const extName = path.extname(filePath).toLowerCase()
  switch (extName) {
    case '.mp4':
    case '.mkv': {
      return handleVideoProtocol(filePath, request)
    }
    case '.ass':
    case '.ssa': {
      return handleSubtitleProtocol(filePath)
    }
  }
  return new Response('Not Found', { status: 404 })
}

const handleSubtitleProtocol = (filePath: string) => {
  const content = fs.readFileSync(filePath, 'utf-8')
  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain',
    },
  })
}

const handleVideoProtocol = (filePath: string, request: Request) => {
  const makeUnsupportedRangeResponse = () => {
    return new Response('unsupported range', {
      status: 416,
    })
  }

  const rangeHeader = request.headers.get('Range')
  if (!rangeHeader?.startsWith('bytes=')) {
    return makeUnsupportedRangeResponse()
  }

  const stat = statSync(filePath)

  const startByte = Number(rangeHeader.match(/(\d+)-/)?.[1] || '0')
  const endByte = Number(rangeHeader.match(/-(\d+)/)?.[1] || `${stat.size - 1}`)

  if (endByte > stat.size || startByte < 0) {
    return makeUnsupportedRangeResponse()
  }
  const resultStream = createReadStream(filePath, { start: startByte, end: endByte })
  const headers = new Headers([
    ['Accept-Ranges', 'bytes'],
    ['Content-Type', fromFilename(filePath) || 'video/mp4'],
    ['Content-Length', `${endByte + 1 - startByte}`],
    ['Content-Range', `bytes ${startByte}-${endByte}/${stat.size}`],
  ])

  return new Response(nodeStreamToWeb(resultStream), { headers, status: 206 })
}

const nodeStreamToWeb = (resultStream: ReadStream) => {
  resultStream.pause()

  let closed = false

  return new ReadableStream(
    {
      start: (controller) => {
        resultStream.on('data', (chunk) => {
          if (closed) {
            return
          }

          if (Buffer.isBuffer(chunk)) {
            controller.enqueue(new Uint8Array(chunk))
          } else {
            controller.enqueue(chunk)
          }

          if (controller.desiredSize !== null && controller.desiredSize <= 0) {
            resultStream.pause()
          }
        })

        resultStream.on('error', (error) => {
          controller.error(error)
        })

        resultStream.on('end', () => {
          if (!closed) {
            closed = true
            controller.close()
          }
        })
      },
      pull: (_controller) => {
        if (closed) {
          return
        }

        resultStream.resume()
      },
      cancel: () => {
        if (!closed) {
          closed = true
          resultStream.close()
        }
      },
    },
    { highWaterMark: resultStream.readableHighWaterMark },
  )
}

export const getFilePathFromProtocolURL = (protocolUrl: string): string => {
  if (!protocolUrl?.startsWith(MARCHEN_PROTOCOL)) {
    return path.normalize(protocolUrl)
  }
  let filePath = ''
  if (isWindows) {
    filePath = decodeURIComponent(protocolUrl.slice(`${MARCHEN_PROTOCOL}://`.length));

    // 优先判断是否为自定义盘符路径（如 z/code/... -> Z:\code\...）
    if (/^[a-z]\/.+/i.test(filePath)) {
      const driveLetter = filePath[0].toUpperCase(); // 提取盘符并转换为大写
      filePath = `${driveLetter}:\\${filePath.slice(2).replaceAll('/', '\\')}`; // 构造 Windows 格式路径
    } 
    // 判断是否为网络路径（主机名或 IP 地址）
    else if (/^[a-z0-9][a-z0-9-]*(?:\/|$)/i.test(filePath) || /^\d+\.\d+\.\d+\.\d+/.test(filePath)) {
      filePath = `\\\\${filePath.replaceAll('/', '\\')}`; // 转换为 UNC 路径格式
    } 
    // 如果路径以盘符开头，直接规范化
    else if (/^[a-z]:/i.test(filePath)) {
      filePath = path.win32.normalize(filePath);
    } 
    // 其他情况可能是相对路径，直接返回规范化结果
    else {
      filePath = path.win32.normalize(filePath);
    }
  } else {
    filePath = decodeURIComponent(protocolUrl.slice(`${MARCHEN_PROTOCOL}:/`.length))
    // 非 Windows 系统，直接返回路径
    filePath = path.normalize(filePath)
  }

  return filePath
}
