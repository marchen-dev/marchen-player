import type {
  FullscreenPort,
  PlayerPorts,
  PlayerSourceHandle,
  PlaylistPort,
  ResolvedSubtitleTrack,
  SnapshotPort,
  SourceLifecyclePort,
  SubtitleCatalogPort,
  SubtitleTrackDescriptor,
} from './ports'
import { MARCHEN_PROTOCOL_PREFIX } from '@marchen/shared/constants/protocol'
import { jotaiStore } from '@renderer/atoms/store'
import { windowFullscreenAtom } from '@renderer/atoms/window'
import { handlers, ipcClient } from '@renderer/lib/client'
import { getPlayerLoadingService } from '@renderer/services/player-loading/index'
import { electronPlayerCapabilities } from './capabilities'
import { toEmbeddedSubtitleTrack } from './embedded-subtitle'

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

export const createElectronSourceLifecyclePort = (): SourceLifecyclePort => ({
  prepare: async (request): Promise<PlayerSourceHandle> => {
    if (request.kind === 'blob') throw new Error('Electron 播放源不接受匿名 Blob')
    const path = request.kind === 'file' ? window.api.showFilePath(request.file) : request.url
    const url = path.startsWith(MARCHEN_PROTOCOL_PREFIX)
      ? path
      : `${MARCHEN_PROTOCOL_PREFIX}${path}`
    return { id: createId(), url, release: () => {} }
  },
  release: () => {},
  dispose: () => {},
})

const createElectronPlaylistPort = (): PlaylistPort => ({
  list: async (currentSourceUrl) => {
    const items = (await ipcClient?.player.getAnimeInSamePath({ path: currentSourceUrl })) ?? []
    return items.map((item) => ({
      id: item.urlWithPrefix,
      name: item.name,
      sourceUrl: item.urlWithPrefix,
    }))
  },
  play: (entry) => getPlayerLoadingService().loadFromPath(entry.sourceUrl),
})

const createElectronSnapshotPort = (): SnapshotPort => ({
  capture: async ({ sourceUrl, time }) => {
    const snapshot = await ipcClient?.player.grabFrame({ path: sourceUrl, time: String(time) })
    if (!snapshot) throw new Error('视频截图失败')
    return snapshot
  },
})

const createElectronSubtitleCatalogPort = (): SubtitleCatalogPort => {
  const embeddedTracks = new Map<string, SubtitleTrackDescriptor>()
  const externalTracks = new Map<string, { track: SubtitleTrackDescriptor; path: string }>()
  const nearbyTracks = new Map<string, { fileName: string; filePath: string }>()

  return {
    list: async (sourceUrl) => {
      const [streams, nearbyFiles] = await Promise.all([
        ipcClient?.player.getSubtitlesIntroFromAnime({ path: sourceUrl }),
        ipcClient?.player.matchSubtitleFile({ path: sourceUrl }),
      ])
      embeddedTracks.clear()
      nearbyTracks.clear()
      const tracks = (streams ?? []).map((stream, listIndex) => {
        // getSubtitlesBody 使用 FFmpeg 的 0:s:N 语义，N 是字幕流内的相对索引，
        // 不能直接使用 ffprobe 返回的全文件流索引（例如视频 0、音频 1、字幕 2）。
        const track = toEmbeddedSubtitleTrack(stream, listIndex)
        embeddedTracks.set(track.id, track)
        return track
      })
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
      const track: SubtitleTrackDescriptor = {
        id,
        title,
        origin: 'external',
      }
      externalTracks.set(track.id, { track, path })
      return resolveSubtitleFile(track, path)
    },
    resolve: async (sourceUrl, track) => {
      if (track.origin === 'external') {
        const external = externalTracks.get(track.id)
        if (external) return resolveSubtitleFile(external.track, external.path)
        const nearby = nearbyTracks.get(track.id)
        if (!nearby) throw new Error(`外挂字幕不存在：${track.title}`)
        const converted = await ipcClient?.utils.coverSubtitleToAss({ path: nearby.filePath })
        if (!converted) throw new Error(`字幕转换失败：${track.title}`)
        externalTracks.set(track.id, { track, path: converted.filePath })
        return resolveSubtitleFile(track, converted.filePath)
      }

      const index = Number(track.id.replace('embedded:', ''))
      if (!Number.isInteger(index)) throw new Error(`内嵌字幕标识无效：${track.id}`)
      const result = await ipcClient?.player.getSubtitlesBody({ path: sourceUrl, index })
      if (!result?.ok || !result.data) throw new Error(result?.message || '内嵌字幕提取失败')
      return resolveSubtitleFile(track, result.data)
    },
  }
}

const resolveSubtitleFile = async (
  track: SubtitleTrackDescriptor,
  path: string,
): Promise<ResolvedSubtitleTrack> => {
  const result = await ipcClient?.player.readSubtitleText({ path })
  if (!result?.ok || !result.data) throw new Error(result?.message || '字幕文件读取失败')
  const url = URL.createObjectURL(new Blob([result.data], { type: 'text/plain;charset=utf-8' }))
  let released = false
  return {
    ...track,
    url,
    persistencePath: path,
    release: () => {
      if (released) return
      released = true
      URL.revokeObjectURL(url)
    },
  }
}

const createId = () =>
  globalThis.crypto?.randomUUID?.() ?? `player-source-${Date.now()}-${Math.random()}`
