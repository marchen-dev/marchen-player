import type {
  FullscreenPort,
  PlayerPorts,
  PlaylistPort,
  ResolvedSubtitleTrack,
  SnapshotPort,
  SubtitleCatalogPort,
  SubtitleTrackDescriptor,
} from './ports'
import { jotaiStore } from '@renderer/atoms/store'
import { windowFullscreenAtom } from '@renderer/atoms/window'
import { handlers, ipcClient } from '@renderer/lib/client'
import { getPlayerLoadingService } from '@renderer/services/player-loading/index'
import { mediaFrameQueue } from '../../media/frame-queue'
import { parseTextSubtitles, textSubtitlesToAss } from '../../media/subtitles/text'
import { getSelectedPathPlaylist } from '../../player-loading/file-playlist'
import { electronPlayerCapabilities } from './capabilities'
import { listEmbeddedSubtitles, resolveEmbeddedTrack } from './embedded-catalog'
import { createResourceLifecyclePort } from './resource-lifecycle'

export const createElectronPlayerPorts = (): PlayerPorts => ({
  capabilities: electronPlayerCapabilities,
  fullscreen: createElectronFullscreenPort(),
  sourceLifecycle: createElectronSourceLifecyclePort(),
  playlist: createElectronPlaylistPort(),
  snapshot: createElectronSnapshotPort(),
  subtitles: createElectronSubtitleCatalogPort(),
})

export const createElectronFullscreenPort = (): FullscreenPort => {
  const listeners = new Set<(active: boolean) => void>()
  const setActive = (active: boolean) => {
    jotaiStore.set(windowFullscreenAtom, active)
    listeners.forEach((listener) => listener(active))
  }

  void ipcClient?.setting.getWindowIsFullScreen().then((active) => {
    if (typeof active === 'boolean') setActive(active)
  })

  return {
    mode: 'window',
    getSnapshot: () => ({ active: jotaiStore.get(windowFullscreenAtom), mode: 'window' }),
    enter: async () => {
      if (!jotaiStore.get(windowFullscreenAtom)) {
        await ipcClient?.app.windowAction({ action: 'enter-full-screen' })
      }
    },
    exit: async () => {
      if (jotaiStore.get(windowFullscreenAtom)) {
        await ipcClient?.app.windowAction({ action: 'leave-full-screen' })
      }
    },
    toggle: async () => {
      await ipcClient?.app.windowAction({ action: 'switch-full-screen' })
    },
    subscribe: (listener) => {
      const notify = (active: boolean) => listener({ active, mode: 'window' })
      listeners.add(notify)
      notify(jotaiStore.get(windowFullscreenAtom))
      const unlisten = handlers?.windowAction.listen((action) => {
        if (action !== 'enter-full-screen' && action !== 'leave-full-screen') return
        const active = action === 'enter-full-screen'
        jotaiStore.set(windowFullscreenAtom, active)
        notify(active)
      })
      return () => {
        listeners.delete(notify)
        unlisten?.()
      }
    },
  }
}

export const createElectronSourceLifecyclePort = createResourceLifecyclePort

const createElectronPlaylistPort = (): PlaylistPort => ({
  list: async (currentSource) => {
    if (currentSource.kind !== 'electron-file') return []
    const selected = getSelectedPathPlaylist(currentSource.path)
    if (selected) return selected
    const items = (await ipcClient?.player.getAnimeInSamePath({ path: currentSource.path })) ?? []
    return items.map((item) => ({
      id: item.path,
      name: item.name,
      path: item.path,
    }))
  },
  play: (entry) => {
    if (entry.path) getPlayerLoadingService().loadFromPath(entry.path)
  },
})

const createElectronSnapshotPort = (): SnapshotPort => ({
  capture: (request) =>
    mediaFrameQueue.request(`history:${request.source.hash}`, { ...request, maxWidth: 640 }, 0),
})

const createElectronSubtitleCatalogPort = (): SubtitleCatalogPort => {
  const externalTracks = new Map<string, { track: SubtitleTrackDescriptor; path: string }>()
  const nearbyTracks = new Map<string, { fileName: string; filePath: string }>()

  return {
    list: async (source, signal) => {
      if (source.kind !== 'electron-file') return []
      const [tracks, nearbyFiles] = await Promise.all([
        listEmbeddedSubtitles(source, signal),
        ipcClient?.player.matchSubtitleFile({ path: source.path }),
      ])
      nearbyTracks.clear()
      const nearby = (nearbyFiles ?? []).map((file) => {
        const id = `nearby:${file.filePath}`
        nearbyTracks.set(id, file)
        return {
          id,
          title: file.fileName,
          origin: 'external' as const,
        }
      })
      return [...tracks, ...nearby, ...[...externalTracks.values()].map(({ track }) => track)]
    },
    importExternal: async () => {
      const imported = await ipcClient?.player.importSubtitle()
      if (!imported) return null
      const track: SubtitleTrackDescriptor = {
        id: `external:${imported.filePath}`,
        title: imported.fileName,
        origin: 'external',
      }
      externalTracks.set(track.id, { track, path: imported.filePath })
      return resolveSubtitleFile(track, imported.filePath)
    },
    restoreExternal: async (path, title, id = `external:${path}`) => {
      if (!path) throw new Error(`请重新选择外挂字幕：${title}`)
      const track: SubtitleTrackDescriptor = {
        id,
        title,
        origin: 'external',
      }
      externalTracks.set(track.id, { track, path })
      return resolveSubtitleFile(track, path)
    },
    resolve: async (source, track, signal) => {
      if (track.origin === 'external') {
        const external = externalTracks.get(track.id)
        if (external) return resolveSubtitleFile(external.track, external.path)
        const nearby = nearbyTracks.get(track.id)
        if (!nearby) throw new Error(`外挂字幕不存在：${track.title}`)
        externalTracks.set(track.id, { track, path: nearby.filePath })
        return resolveSubtitleFile(track, nearby.filePath)
      }

      return resolveEmbeddedTrack(source, track, signal)
    },
  }
}

const resolveSubtitleFile = async (
  track: SubtitleTrackDescriptor,
  path: string,
): Promise<ResolvedSubtitleTrack> => {
  const result = await ipcClient?.player.readSubtitleText({ path })
  if (!result?.ok || !result.data) throw new Error(result?.message || '字幕文件读取失败')
  const format = path.toLowerCase().split('.').pop()
  const converted =
    format === 'srt' || format === 'vtt' ? parseTextSubtitles(result.data, format) : undefined
  const text = converted ? textSubtitlesToAss(converted.cues) : result.data
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  let released = false
  return {
    ...track,
    url,
    persistencePath: path,
    warning: converted?.warnings.join('；') || undefined,
    release: () => {
      if (released) return
      released = true
      URL.revokeObjectURL(url)
    },
  }
}
