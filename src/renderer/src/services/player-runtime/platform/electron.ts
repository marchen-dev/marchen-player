import type { MediaSourceErrorCode } from '@marchen/shared/media-sources'
import type {
  FullscreenPort,
  PlayerPorts,
  PlaylistPort,
  ResolvedSubtitleTrack,
  SnapshotPort,
  SubtitleCatalogPort,
  SubtitleTrackDescriptor,
} from './ports'
import { providerHistoryKey } from '@marchen/shared/media'
import { MediaSourceError } from '@marchen/shared/media-sources'
import { jotaiStore } from '@renderer/atoms/store'
import { windowFullscreenAtom } from '@renderer/atoms/window'
import { handlers, ipcClient } from '@renderer/lib/client'
import { getPlayerLoadingService } from '@renderer/services/player-loading/index'
import { reportOperationalError } from '@renderer/services/telemetry/operational-errors'
import { markNextPlayerImportSource } from '@renderer/services/telemetry/player-loading-observer'
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
    if (currentSource.kind === 'provider-item') {
      const { sourceId } = currentSource
      const result = await ipcClient?.mediaSources.siblings({
        sourceId,
        itemRef: currentSource.itemRef,
      })
      if (!result?.ok) {
        // 拿不到同目录列表只是没有上一集 / 下一集，当前视频照常播放
        if (result)
          reportOperationalError('ipc', 'media_source_siblings', toSourceError(result), true)
        return []
      }
      return result.value.map((node) => ({
        id: `${sourceId}:${node.ref}`,
        name: node.title,
        // 与播放记录主键一致，播放列表可以直接显示每集进度
        fileHash: providerHistoryKey(sourceId, node.ref),
        provider: { sourceId, itemRef: node.ref },
      }))
    }
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
    if (entry.provider) {
      markNextPlayerImportSource('media_source')
      getPlayerLoadingService().loadFromProvider(entry.provider.sourceId, entry.provider.itemRef)
      return
    }
    if (entry.path) getPlayerLoadingService().loadFromPath(entry.path)
  },
})

const createElectronSnapshotPort = (): SnapshotPort => ({
  capture: (request) =>
    mediaFrameQueue.request(`history:${request.source.hash}`, { ...request, maxWidth: 640 }, 0),
})

export const createElectronSubtitleCatalogPort = (): SubtitleCatalogPort => {
  const externalTracks = new Map<string, { track: SubtitleTrackDescriptor; path: string }>()
  const nearbyTracks = new Map<string, { fileName: string; filePath: string }>()
  const providerTracks = new Map<
    string,
    { sourceId: string; itemRef: string; subtitleId: string; format: string }
  >()

  return {
    list: async (source, signal) => {
      if (source.kind === 'provider-item') {
        nearbyTracks.clear()
        providerTracks.clear()
        const { sourceId, itemRef } = source
        const result = await ipcClient?.mediaSources.subtitles({ sourceId, itemRef })
        signal?.throwIfAborted()
        // 字幕列表读取失败不影响播放，手动导入的外挂字幕仍然可用
        if (result && !result.ok)
          reportOperationalError('ipc', 'media_source_subtitles', toSourceError(result), true)
        const tracks = (result?.ok ? result.value : []).map((subtitle) => {
          const id = `${PROVIDER_SUBTITLE_PREFIX}${subtitle.id}`
          providerTracks.set(id, {
            sourceId,
            itemRef,
            subtitleId: subtitle.id,
            format: subtitle.format,
          })
          return {
            id,
            title: subtitle.title,
            language: subtitle.language,
            origin: 'external' as const,
            persistenceKey: id,
          }
        })
        return [...tracks, ...[...externalTracks.values()].map(({ track }) => track)]
      }
      if (source.kind === 'remote-url') {
        nearbyTracks.clear()
        return [
          ...(await listEmbeddedSubtitles(source, signal)),
          ...[...externalTracks.values()].map(({ track }) => track),
        ]
      }
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
      // 媒体源字幕只能从当前列表读取；走到这里说明本次没能列出该字幕
      if (path.startsWith(PROVIDER_SUBTITLE_PREFIX))
        throw new Error(`媒体源字幕暂时无法读取：${title}`)
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
        const provider = providerTracks.get(track.id)
        if (provider) {
          const result = await ipcClient?.mediaSources.readSubtitle({
            sourceId: provider.sourceId,
            itemRef: provider.itemRef,
            subtitleId: provider.subtitleId,
          })
          signal?.throwIfAborted()
          if (!result?.ok) {
            const error = result ? toSourceError(result) : new Error('字幕加载失败')
            // 异常本身由字幕上下文经 reportSubtitleFailure 上报，这里只补带稳定错误码的诊断记录
            reportOperationalError('ipc', 'media_source_read_subtitle', error, true)
            throw error
          }
          return resolveSubtitleText(track, result.value, provider.format, track.id)
        }
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
  return resolveSubtitleText(track, result.data, path.toLowerCase().split('.').pop(), path)
}

const PROVIDER_SUBTITLE_PREFIX = 'provider:'

/** IPC 失败结果转为带稳定错误码的异常，供遥测按错误码聚合 */
const toSourceError = (result: { code: MediaSourceErrorCode; message: string }) =>
  new MediaSourceError(result.code, result.message)

/** srt / vtt 先转换为 ASS，统一交给 libass 渲染；persistencePath 写入 HISTORY 以便恢复选择 */
const resolveSubtitleText = (
  track: SubtitleTrackDescriptor,
  data: string,
  format: string | undefined,
  persistencePath: string,
): ResolvedSubtitleTrack => {
  const converted =
    format === 'srt' || format === 'vtt' ? parseTextSubtitles(data, format) : undefined
  const text = converted ? textSubtitlesToAss(converted.cues) : data
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  let released = false
  return {
    ...track,
    url,
    persistencePath,
    warning: converted?.warnings.join('；') || undefined,
    release: () => {
      if (released) return
      released = true
      URL.revokeObjectURL(url)
    },
  }
}
