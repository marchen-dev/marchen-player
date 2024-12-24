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

export const getFilePathFromProtocolURL = (protocolUrl: string) => {
  if (!protocolUrl?.startsWith(MARCHEN_PROTOCOL)) {
    return path.normalize(protocolUrl)
  }
  let filePath = decodeURIComponent(protocolUrl.slice(`${MARCHEN_PROTOCOL}:/`.length))
  if (isWindows) {
    filePath = filePath.slice(1)
    filePath = path.win32.normalize(filePath)
    // eslint-disable-next-line unicorn/prefer-regexp-test
    if (filePath.match(/^[a-z]\\/i)) {
      filePath = `${filePath.charAt(0).toUpperCase()}:${filePath.slice(1)}`
    }
  }
  return path.normalize(filePath)
}
