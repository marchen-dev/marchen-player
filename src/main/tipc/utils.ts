import path from 'node:path'

import { getFilePathFromProtocolURL } from '@main/lib/protocols'
import { coverSubtitleToAss } from '@main/lib/utils'

import { t } from './_instance'

type Actions =
  | 'cover-path-from-protocol'
  | 'get-file-name-from-path'
  | 'url-to-base64'
  | 'cover-subtitle-to-ass'

// type FileAction<T extends Actions> = T extends 'cover-subtitle-to-ass'

export const utilsRoute = {
  fileAction: t.procedure
    .input<{
      action: Actions
      url: string
    }>()
    .action(async ({ input }) => {
      const { url, action } = input

      switch (action) {
        case 'cover-path-from-protocol': {
          return getFilePathFromProtocolURL(url)
        }
        case 'get-file-name-from-path': {
          return path.basename(url)
        }
        case 'url-to-base64': {
          try {
            const response = await fetch(url)
            const arrayBuffer = await response.arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)
            const base64 = buffer.toString('base64')
            return `data:${response.headers.get('content-type')};base64,${base64}`
          } catch (error) {
            console.error('Error converting image to base64:', error)
            return
          }
        }
        default: {
          throw new Error(`Unsupported action: ${action}`)
        }
      }
    }),
  coverSubtitleToAss: t.procedure.input<{ path: string }>().action(({ input }) => {
    return coverSubtitleToAss(input.path)
  }),
}
