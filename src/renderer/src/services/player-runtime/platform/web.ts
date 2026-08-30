import type {
  FullscreenPort,
  PlayerPorts,
  PlayerSourceHandle,
  PlayerSourceRequest,
  ResolvedSubtitleTrack,
  SourceLifecyclePort,
  SubtitleCatalogPort,
  SubtitleTrackDescriptor,
} from './ports'
import { webPlayerCapabilities } from './capabilities'
import { createPlaybackSourceLease } from './playback-lease'

export const createWebPlayerPorts = (): PlayerPorts => {
  const sourceLifecycle = createWebSourceLifecyclePort()
  return {
    capabilities: webPlayerCapabilities,
    fullscreen: createBrowserFullscreenPort(),
    sourceLifecycle,
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

export const createWebSourceLifecyclePort = (): SourceLifecyclePort => {
  const liveHandles = new Map<string, string | null>()

  const releaseById = (id: string) => {
    if (!liveHandles.has(id)) return
    const objectUrl = liveHandles.get(id)
    liveHandles.delete(id)
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }

  return {
    prepare: async (source) => {
      if (source.kind !== 'web-file') throw new Error('Web 播放源只接受当前页面持有的 File')
      const id = createId()
      const url = URL.createObjectURL(source.file)
      liveHandles.set(id, url)
      return createPlaybackSourceLease(
        {
          id,
          logicalSourceId: source.hash,
          mode: 'direct',
          transport: 'object-url',
          url,
          timeline: { originalDuration: 0, offset: 0, calibrated: false },
        },
        () => releaseById(id),
      )
    },
    prepareResource: async (request: PlayerSourceRequest): Promise<PlayerSourceHandle> => {
      const id = createId()
      const objectUrl =
        request.kind === 'url'
          ? null
          : URL.createObjectURL(request.kind === 'file' ? request.file : request.blob)
      const url = request.kind === 'url' ? request.url : objectUrl!
      liveHandles.set(id, objectUrl)
      return { id, url, release: () => releaseById(id) }
    },
    release: (lease) => lease.release(),
    releaseResource: (handle) => releaseById(handle.id),
    dispose: () => {
      for (const id of [...liveHandles.keys()]) releaseById(id)
    },
  }
}

export const createWebSubtitleCatalogPort = (
  sourceLifecycle: SourceLifecyclePort,
  selectFile: () => Promise<File | null> = selectSubtitleFile,
): SubtitleCatalogPort => {
  const descriptors = new Map<string, SubtitleTrackDescriptor>()
  const tracks = new Map<string, ResolvedSubtitleTrack>()
  const files = new Map<string, File>()

  const createResolvedFileTrack = async (id: string, file: File) => {
    const source = await sourceLifecycle.prepareResource({ kind: 'file', file })
    const track: ResolvedSubtitleTrack = {
      id,
      title: file.name,
      origin: 'external',
      url: source.url,
      release: () => {
        source.release()
        tracks.delete(id)
      },
    }
    tracks.set(id, track)
    return track
  }

  return {
    list: async () => [...descriptors.values()],
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
    restoreExternal: async (path, title, id = createId()) => {
      const track: ResolvedSubtitleTrack = {
        id,
        title,
        origin: 'external',
        url: path,
      }
      descriptors.set(track.id, track)
      tracks.set(track.id, track)
      return track
    },
    resolve: async (_source, track: SubtitleTrackDescriptor) => {
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
    input.accept = '.ass,.ssa'
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true })
    input.addEventListener('cancel', () => resolve(null), { once: true })
    input.click()
  })

const createId = () =>
  globalThis.crypto?.randomUUID?.() ?? `player-source-${Date.now()}-${Math.random()}`
