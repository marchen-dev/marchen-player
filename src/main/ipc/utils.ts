import { getFilePathFromProtocolURL } from '@main/lib/protocols'
import { coverSubtitleToAss } from '@main/lib/utils'
import { tipc } from '@marchen/electron-ipc/main'

const t = tipc.create()

export const utilsGroup = {
  getFilePathFromProtocolURL: t.procedure
    .input<{ path: string }>()
    .action(async ({ input }) => {
      return getFilePathFromProtocolURL(input.path)
    }),

  coverSubtitleToAss: t.procedure
    .input<{ path: string }>()
    .action(async ({ input }) => {
      return coverSubtitleToAss(input.path)
    }),
}
