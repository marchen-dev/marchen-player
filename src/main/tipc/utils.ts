import path from 'node:path'

import { getFilePathFromProtocolURL } from '@main/lib/protocols'

import { t } from './_instance'

export const utilsRoute = {
  getFilePathFromProtocolURL: t.procedure.input<{ path: string }>().action(async ({ input }) => {
    return getFilePathFromProtocolURL(input.path)
  }),
  getFileNameFromPath: t.procedure.input<{ path: string }>().action(async ({ input }) => {
    return path.basename(input.path)
  }),
}
