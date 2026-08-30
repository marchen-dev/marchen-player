import type { MediaCompatError } from '@marchen/shared/media'
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
import { jotaiStore } from '@renderer/atoms/store'
import { windowFullscreenAtom } from '@renderer/atoms/window'
import { handlers, ipcClient } from '@renderer/lib/client'
import { getPlayerLoadingService } from '@renderer/services/player-loading/index'
import { queryBrowserMediaCapabilities } from '../media-capabilities'
import { createNativeDecodeFallbackPlan, createPlaybackPlan } from '../playback-plan'
import { electronPlayerCapabilities } from './capabilities'
import { resolveForcedOutputProfile } from './development-overrides'
import { prepareElectronDirectLease } from './electron-direct-lease'
import { toEmbeddedSubtitleTrack } from './embedded-subtitle'
import { createPlaybackSourceLease } from './playback-lease'

const asMediaCompatError = (detail: MediaCompatError): Error & MediaCompatError =>
  Object.assign(new Error(detail.message), detail)

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

const waitForCompatibleLease = async (sessionId: string) => {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const response = await ipcClient?.media.get({ sessionId })
    if (!response) throw new Error('媒体会话 IPC 不可用')
    if (!response.ok) throw asMediaCompatError(response.error)
    if (response.data.status === 'ready' && response.data.lease) return response.data.lease
    if (response.data.status === 'failed') {
      throw response.data.error
        ? asMediaCompatError(response.data.error)
        : new Error('兼容播放会话生成失败')
    }
    if (response.data.status === 'released') throw new Error('兼容播放会话已经释放')
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('等待兼容播放首批分片超时')
}

export const createElectronSourceLifecyclePort = (): SourceLifecyclePort => ({
  prepare: async (source, options) => {
    if (source.kind !== 'electron-file') throw new Error('Electron 播放源只接受本地文件路径')
    const runtimeResponse = await ipcClient?.media.capabilities()
    const runtimeCapabilities = runtimeResponse?.ok ? runtimeResponse.data : undefined
    electronPlayerCapabilities.ffmpegPlayback = runtimeCapabilities?.available === true
    electronPlayerCapabilities.ffmpegPlaybackStatus = runtimeCapabilities?.available
      ? 'available'
      : 'unavailable'

    // FFmpeg 或 Gateway 自检失败时不阻塞既有直放；兼容能力明确降级为不可用。
    if (!runtimeCapabilities?.available) {
      if (options?.nativeDecodeFailed) throw new Error('FFmpeg 兼容播放后端当前不可用')
      return prepareDirect(source)
    }

    const probeResponse = await ipcClient?.media.probe({ source })
    if (!probeResponse) throw new Error('媒体探测 IPC 不可用')
    if (!probeResponse.ok) throw asMediaCompatError(probeResponse.error)
    const browserCapabilities = await queryBrowserMediaCapabilities(probeResponse.data)
    const plannerCapabilities = {
      toneMapToSdr: runtimeCapabilities.toneMapToSdr,
      forceProfile: options?.forceProfile ?? resolveForcedOutputProfile(import.meta.env),
    }
    const planning = options?.nativeDecodeFailed
      ? createNativeDecodeFallbackPlan(probeResponse.data, browserCapabilities, plannerCapabilities)
      : createPlaybackPlan(probeResponse.data, browserCapabilities, plannerCapabilities)
    if (!planning.ok) throw asMediaCompatError(planning.error)
    if (planning.plan.kind === 'native') return prepareDirect(source)

    const prepared = await ipcClient?.media.prepare({
      requestId: createId(),
      source,
      plan: planning.plan,
      startTime: Math.max(0, options?.startTime ?? 0),
      attemptChain: options?.attemptChain ?? [planning.plan.kind],
    })
    if (!prepared) throw new Error('兼容播放会话 IPC 不可用')
    if (!prepared.ok) throw asMediaCompatError(prepared.error)
    const sessionId = prepared.data.id
    try {
      const descriptor =
        prepared.data.status === 'ready' && prepared.data.lease
          ? prepared.data.lease
          : await waitForCompatibleLease(sessionId)
      return createPlaybackSourceLease(
        descriptor,
        () => {
          void ipcClient?.media.release({ sessionId })
        },
        async (logicalTime, expectedGeneration) => {
          const seeked = await ipcClient?.media.seek({
            sessionId,
            expectedGeneration,
            logicalTime,
          })
          if (!seeked) throw new Error('seek generation IPC 不可用')
          if (!seeked.ok) throw asMediaCompatError(seeked.error)
          if (seeked.data.status === 'ready' && seeked.data.lease) return seeked.data.lease
          return waitForCompatibleLease(sessionId)
        },
        async (phase, generation, error) => {
          const request =
            phase === 'failed'
              ? { sessionId, generation, phase, error: error! }
              : { sessionId, generation, phase }
          const acknowledged = await ipcClient?.media.acknowledge(request)
          if (!acknowledged) throw new Error('媒体会话阶段确认 IPC 不可用')
          if (!acknowledged.ok) throw asMediaCompatError(acknowledged.error)
        },
      )
    } catch (error) {
      void ipcClient?.media.release({ sessionId })
      throw error
    }
  },
  prepareResource: async (request): Promise<PlayerSourceHandle> => {
    if (request.kind === 'url') return { id: createId(), url: request.url, release: () => {} }
    const url = URL.createObjectURL(request.kind === 'file' ? request.file : request.blob)
    return { id: createId(), url, release: () => URL.revokeObjectURL(url) }
  },
  release: (lease) => lease.release(),
  releaseResource: () => {},
  dispose: () => {},
})

const prepareDirect = (
  source: Extract<Parameters<SourceLifecyclePort['prepare']>[0], { kind: 'electron-file' }>,
) =>
  prepareElectronDirectLease(source, {
    gatewayEnabled: import.meta.env.VITE_MEDIA_GATEWAY_DIRECT === '1',
    prepareGateway: async (source) =>
      ipcClient?.media.prepareDirect({ requestId: createId(), source }),
    releaseGateway: (sessionId) => {
      void ipcClient?.media.release({ sessionId })
    },
  })

const createElectronPlaylistPort = (): PlaylistPort => ({
  list: async (currentSource) => {
    if (currentSource.kind !== 'electron-file') return []
    const items = (await ipcClient?.player.getAnimeInSamePath({ path: currentSource.path })) ?? []
    return items.map((item) => ({
      id: item.path,
      name: item.name,
      path: item.path,
    }))
  },
  play: (entry) => getPlayerLoadingService().loadFromPath(entry.path),
})

const createElectronSnapshotPort = (): SnapshotPort => ({
  capture: async ({ source, time }) => {
    if (source.kind !== 'electron-file') throw new Error('Electron 截图需要原始文件路径')
    const snapshot = await ipcClient?.player.grabFrame({ path: source.path, time: String(time) })
    if (!snapshot) throw new Error('视频截图失败')
    return snapshot
  },
})

const createElectronSubtitleCatalogPort = (): SubtitleCatalogPort => {
  const embeddedTracks = new Map<string, SubtitleTrackDescriptor>()
  const externalTracks = new Map<string, { track: SubtitleTrackDescriptor; path: string }>()
  const nearbyTracks = new Map<string, { fileName: string; filePath: string }>()

  return {
    list: async (source) => {
      if (source.kind !== 'electron-file') return []
      const [streams, nearbyFiles] = await Promise.all([
        ipcClient?.player.getSubtitlesIntroFromAnime({ path: source.path }),
        ipcClient?.player.matchSubtitleFile({ path: source.path }),
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
    resolve: async (source, track) => {
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
      if (source.kind !== 'electron-file') throw new Error('Electron 内嵌字幕需要原始文件路径')
      const result = await ipcClient?.player.getSubtitlesBody({ path: source.path, index })
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
