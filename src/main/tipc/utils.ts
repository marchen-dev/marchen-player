import { getFilePathFromProtocolURL } from '@main/lib/protocols'
import { coverSubtitleToAss } from '@main/lib/utils'

import { t } from './_instance'

export const utilsRoute = {
  getFilePathFromProtocolURL: t.procedure.input<{ path: string }>().action(async ({ input }) => {
    return getFilePathFromProtocolURL(input.path)
  }),
  coverSubtitleToAss: t.procedure.input<{ path: string }>().action(async ({ input }) => {
    return coverSubtitleToAss(input.path)
  }),
}
