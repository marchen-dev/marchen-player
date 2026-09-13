import type { Plugin } from 'vite'

export const mediaIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
} as const

/** Vite 的部分 304 分支早于 server.headers 返回，Worker 也必须收到一致的隔离策略。 */
export function mediaIsolationPlugin(): Plugin {
  return {
    name: 'marchen-media-isolation',
    configureServer(server) {
      server.middlewares.use((_request, response, next) => {
        for (const [name, value] of Object.entries(mediaIsolationHeaders))
          response.setHeader(name, value)
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((_request, response, next) => {
        for (const [name, value] of Object.entries(mediaIsolationHeaders))
          response.setHeader(name, value)
        next()
      })
    },
  }
}
