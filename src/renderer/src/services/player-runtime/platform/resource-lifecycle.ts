import type { SourceLifecyclePort } from './ports'

/** 只管理临时资源 URL；播放原文件由 MediaSourceOwner 与平台授权租约管理。 */
export const createResourceLifecyclePort = (): SourceLifecyclePort => {
  const live = new Map<string, string | null>()
  const release = (id: string) => {
    if (!live.has(id)) return
    const url = live.get(id)
    live.delete(id)
    if (url) URL.revokeObjectURL(url)
  }
  return {
    prepareResource: async (request) => {
      const id = crypto.randomUUID()
      const objectUrl =
        request.kind === 'url'
          ? null
          : URL.createObjectURL(request.kind === 'file' ? request.file : request.blob)
      live.set(id, objectUrl)
      return {
        id,
        url: request.kind === 'url' ? request.url : objectUrl!,
        release: () => release(id),
      }
    },
    releaseResource: (handle) => handle.release(),
    dispose: () => {
      for (const id of [...live.keys()]) release(id)
    },
  }
}
