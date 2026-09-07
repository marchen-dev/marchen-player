import type {
  FullscreenPort,
  PlayerPorts,
  ResolvedSubtitleTrack,
  SourceLifecyclePort,
  SubtitleCatalogPort,
  SubtitleTrackDescriptor,
} from './ports'
import { mediaFrameQueue } from '../../media/frame-queue'
import { parseTextSubtitles, textSubtitlesToAss } from '../../media/subtitles/text'
import { getWebPlaylist } from '../../player-loading/file-playlist'
import { webPlayerCapabilities } from './capabilities'
import { listEmbeddedSubtitles, resolveEmbeddedTrack } from './embedded-catalog'
import { createResourceLifecyclePort } from './resource-lifecycle'

export const createWebPlayerPorts = (): PlayerPorts => {
  const sourceLifecycle = createWebSourceLifecyclePort()
  return {
    capabilities: webPlayerCapabilities,
    fullscreen: createBrowserFullscreenPort(),
    sourceLifecycle,
    playlist: {
      list: async () => getWebPlaylist(),
      play: (entry) => {
        if (entry.file)
          void import('../../player-loading').then(({ getPlayerLoadingService }) =>
            getPlayerLoadingService().loadFromFile(entry.file!),
          )
      },
    },
    snapshot: {
      capture: (request) =>
        mediaFrameQueue.request(`history:${request.source.hash}`, { ...request, maxWidth: 640 }, 0),
    },
    subtitles: createWebSubtitleCatalogPort(sourceLifecycle),
  }
}

export const createBrowserFullscreenPort = (): FullscreenPort => ({
  mode: 'dom',
  getSnapshot: () => ({ active: Boolean(document.fullscreenElement), mode: 'dom' }),
  enter: async (root) => {
    if (document.fullscreenElement === root) return
    await root.requestFullscreen()
  },
  exit: async () => {
    if (document.fullscreenElement) await document.exitFullscreen()
  },
  toggle: async (root) => {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await root.requestFullscreen()
  },
  subscribe: (listener) => {
    const notify = () => listener({ active: Boolean(document.fullscreenElement), mode: 'dom' })
    document.addEventListener('fullscreenchange', notify)
    return () => document.removeEventListener('fullscreenchange', notify)
  },
})

export const createWebSourceLifecyclePort = createResourceLifecyclePort

export const createWebSubtitleCatalogPort = (
  sourceLifecycle: SourceLifecyclePort,
  selectFile: () => Promise<File | null> = selectSubtitleFile,
): SubtitleCatalogPort => {
  const descriptors = new Map<string, SubtitleTrackDescriptor>()
  const tracks = new Map<string, ResolvedSubtitleTrack>()
  const files = new Map<string, File>()
  let mediaHash: string | undefined

  const createResolvedFileTrack = async (id: string, file: File) => {
    const format = file.name.toLowerCase().split('.').pop()
    if (file.size > 8 * 1024 * 1024) throw new Error('外挂字幕超过 8 MiB')
    const content = await file.text()
    const converted =
      format === 'srt' || format === 'vtt' ? parseTextSubtitles(content, format) : undefined
    const source = await sourceLifecycle.prepareResource(
      converted
        ? {
            kind: 'blob',
            blob: new Blob([textSubtitlesToAss(converted.cues)], { type: 'text/plain' }),
          }
        : { kind: 'file', file },
    )
    const track: ResolvedSubtitleTrack = {
      id,
      title: file.name,
      origin: 'external',
      url: source.url,
      persistenceContent: content,
      warning: converted?.warnings.join('；') || undefined,
      release: () => {
        source.release()
        tracks.delete(id)
      },
    }
    tracks.set(id, track)
    return track
  }

  return {
    list: async (source, signal) => {
      if (mediaHash && mediaHash !== source.hash) {
        for (const track of [...tracks.values()]) track.release?.()
        tracks.clear()
        files.clear()
        descriptors.clear()
      }
      mediaHash = source.hash
      return [...(await listEmbeddedSubtitles(source, signal)), ...descriptors.values()]
    },
    importExternal: async () => {
      const file = await selectFile()
      if (!file) return null
      const id = createId()
      const descriptor: SubtitleTrackDescriptor = {
        id,
        title: file.name,
        origin: 'external',
      }
      descriptors.set(id, descriptor)
      files.set(id, file)
      return createResolvedFileTrack(id, file)
    },
    restoreExternal: async (_path, title, id = createId(), content) => {
      if (content === undefined) throw new Error(`请重新导入外挂字幕：${title}`)
      const file = new File([content], title, { type: 'text/plain' })
      if (file.size > 8 * 1024 * 1024) throw new Error('保存的字幕超过 8 MiB')
      descriptors.set(id, { id, title, origin: 'external' })
      files.set(id, file)
      return createResolvedFileTrack(id, file)
    },
    resolve: async (source, track: SubtitleTrackDescriptor, signal) => {
      if (track.origin === 'embedded') {
        return resolveEmbeddedTrack(source, track, signal)
      }
      const resolved = tracks.get(track.id)
      if (resolved) return resolved
      const file = files.get(track.id)
      if (file) return createResolvedFileTrack(track.id, file)
      throw new Error(`字幕轨道不存在：${track.title}`)
    },
  }
}

const selectSubtitleFile = () =>
  new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.ass,.ssa,.srt,.vtt'
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true })
    input.addEventListener('cancel', () => resolve(null), { once: true })
    input.click()
  })

const createId = () =>
  globalThis.crypto?.randomUUID?.() ?? `player-source-${Date.now()}-${Math.random()}`
