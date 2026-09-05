import type { MediaCompatError, PlaybackDecision } from '@marchen/shared/media'
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
import { ClientPlaybackProfileCache } from '../client-playback-profile'
import { negotiateMediaCompatibility } from '../compatibility-negotiator'
import { decisionOutputProfile } from '../decision-output-profile'
import { dynamicHlsFallbackRequest } from '../dynamic-hls-fallback'
import { mediaPlaybackAbRecorder } from '../media-playback-ab'
import { comparePlannerResults, resolvePlannerMigrationMode } from '../planner-migration'
import { createNativeDecodeFallbackPlan, createPlaybackPlan } from '../playback-plan'
import { electronPlayerCapabilities } from './capabilities'
import {
  resolveDevelopmentPlaybackOverride,
  resolveForcedOutputProfile,
} from './development-overrides'
import { prepareElectronDirectLease } from './electron-direct-lease'
import { toEmbeddedSubtitleTrack } from './embedded-subtitle'
import { createPlaybackSourceLease } from './playback-lease'
import {
  DEFAULT_PREPARATION_DEADLINES_MS,
  PlaybackStageDeadlineError,
  withPlaybackStageDeadline,
} from '../preparation-deadlines'

const preparationRequest = async <T>(
  requestId: string,
  operation: () => Promise<T>,
  stage: 'probe' | 'job',
  signal?: AbortSignal,
): Promise<T> => {
  signal?.throwIfAborted()
  const pending = operation()
  try {
    // Main 对 probe/keyframe/preflight/job/segment 分别计时；35s 仅兜底失联 IPC。
    return await withPlaybackStageDeadline(stage, pending, {
      signal,
      deadlineMs: stage === 'probe' ? 8_000 : 35_000,
    })
  } catch (error) {
    void ipcClient?.media.cancelPreparation({ requestId })
    // 取消与 Main 登记准备任务发生竞争时，迟到的成功结果也必须释放。
    void pending.then(
      () => ipcClient?.media.cancelPreparation({ requestId }),
      () => undefined,
    )
    throw error
  }
}

const asMediaCompatError = (detail: MediaCompatError): Error & MediaCompatError =>
  Object.assign(new Error(detail.message), detail)

const generalizedProfileCache = new ClientPlaybackProfileCache()

const rendererRuntimeIdentity = () => {
  // 应用会重写 userAgent，运行时版本以 preload 暴露的只读事实为准。
  const versions = window.electron?.process.versions
  const electronVersion =
    versions?.electron ?? navigator.userAgent.match(/Electron\/([^\s]+)/)?.[1] ?? 'unknown'
  const chromiumVersion =
    versions?.chrome ?? navigator.userAgent.match(/Chrome\/([^\s]+)/)?.[1] ?? 'unknown'
  return {
    environment: 'electron' as const,
    platform: navigator.platform,
    electronVersion,
    chromiumVersion,
  }
}

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

const waitForCompatibleLease = async (sessionId: string, signal?: AbortSignal) => {
  let deadlineStage: 'profile' | 'preflight' | 'job' | 'segment' = 'job'
  let stageStartedAt = Date.now()
  while (true) {
    signal?.throwIfAborted()
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
    const nextStage = (() => {
      if (response.data.phase === 'planning') return 'profile' as const
      if (response.data.phase === 'encoder-check') return 'preflight' as const
      if (response.data.phase === 'producing') return 'segment' as const
      return 'job' as const
    })()
    if (nextStage !== deadlineStage) {
      deadlineStage = nextStage
      stageStartedAt = Date.now()
    }
    const deadlineMs = DEFAULT_PREPARATION_DEADLINES_MS[deadlineStage]
    if (Date.now() - stageStartedAt >= deadlineMs) {
      throw new PlaybackStageDeadlineError(deadlineStage, deadlineMs)
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
}

export const createElectronSourceLifecyclePort = (): SourceLifecyclePort => ({
  prepare: async (source, options) => {
    if (source.kind !== 'electron-file') throw new Error('Electron 播放源只接受本地文件路径')
    const runtimeResponse = await withPlaybackStageDeadline(
      'profile',
      Promise.resolve(ipcClient?.media.capabilities()),
      { signal: options?.signal },
    )
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

    const probeRequestId = createId()
    const probeResponse = await preparationRequest(
      probeRequestId,
      () => Promise.resolve(ipcClient?.media.probe({ source, requestId: probeRequestId })),
      'probe',
      options?.signal,
    )
    if (!probeResponse) throw new Error('媒体探测 IPC 不可用')
    if (!probeResponse.ok) throw asMediaCompatError(probeResponse.error)
    const browserCapabilities = await withPlaybackStageDeadline(
      'profile',
      queryBrowserMediaCapabilities(probeResponse.data),
      { signal: options?.signal },
    )
    const plannerCapabilities = {
      toneMapToSdr: runtimeCapabilities.toneMapToSdr,
      forceProfile: options?.forceProfile ?? resolveForcedOutputProfile(import.meta.env),
    }
    let planning = options?.nativeDecodeFailed
      ? createNativeDecodeFallbackPlan(probeResponse.data, browserCapabilities, plannerCapabilities)
      : createPlaybackPlan(probeResponse.data, browserCapabilities, plannerCapabilities)
    const migrationMode = resolvePlannerMigrationMode(import.meta.env)
    let decision: PlaybackDecision | undefined
    const executeGeneralized =
      migrationMode === 'generalized' &&
      import.meta.env.VITE_MEDIA_GATEWAY_V2 === '1' &&
      !options?.nativeDecodeFailed
    if ((migrationMode === 'shadow' || executeGeneralized) && runtimeCapabilities.negotiation) {
      const profileOptions = {
        runtime: rendererRuntimeIdentity(),
        localCompatibilityAvailable: runtimeCapabilities.available,
      }
      let profile = await withPlaybackStageDeadline(
        'profile',
        generalizedProfileCache.getOrCreate(probeResponse.data, profileOptions),
        { signal: options?.signal },
      )
      if (
        profile.fmp4Hls.mediaSourceSupported !== true &&
        runtimeCapabilities.negotiation.aacOutput &&
        probeResponse.data.primaryAudioStreamIndex !== undefined
      ) {
        // 输入 EAC-3 的组合 MSE 查询不能否定 HEVC + AAC 输出。这里只查询候选输出，
        // direct 仍保留输入事实，AAC 条件也不会被误记为 EAC-3 可 copy。
        const candidate = await withPlaybackStageDeadline(
          'profile',
          generalizedProfileCache.getOrCreate(
            {
              ...probeResponse.data,
              streams: probeResponse.data.streams.map((stream) =>
                stream.type === 'audio' &&
                stream.index === probeResponse.data.primaryAudioStreamIndex
                  ? {
                      ...stream,
                      codecName: 'aac',
                      codecString: 'mp4a.40.2',
                      profile: 'LC',
                      channels: 2,
                      sampleRate: 48_000,
                      bitRate: 192_000,
                    }
                  : stream,
              ),
            },
            profileOptions,
          ),
          { signal: options?.signal },
        )
        if (candidate.fmp4Hls.mediaSourceSupported === true)
          profile = { ...profile, fmp4Hls: candidate.fmp4Hls }
      }
      const generalized = negotiateMediaCompatibility({
        facts: probeResponse.data,
        client: profile,
        ffmpeg: runtimeCapabilities.negotiation,
        override: resolveDevelopmentPlaybackOverride(import.meta.env, 'electron'),
      })
      mediaPlaybackAbRecorder.recordPlanner(comparePlannerResults(planning, generalized))
      if (executeGeneralized) {
        if (!generalized.ok) throw asMediaCompatError(generalized.error)
        decision = generalized.decision
        planning = { ok: true, plan: decisionOutputProfile(decision) }
      }
    }
    console.info('[media-planner]', {
      configuredPlanner: migrationMode,
      executedPlanner: decision ? 'generalized' : 'legacy',
      fallbackReason:
        migrationMode === 'generalized' && !decision
          ? options?.nativeDecodeFailed
            ? 'native-decode-recovery-pending-v2'
            : 'v2-or-negotiation-unavailable'
          : undefined,
    })
    if (!planning.ok) throw asMediaCompatError(planning.error)
    if (planning.plan.kind === 'native') return prepareDirect(source)
    const attemptMethods =
      options?.attemptMethods ??
      (decision ? [decision.method] : undefined) ??
      (options?.nativeDecodeFailed
        ? (['direct-play', 'transcode'] as const)
        : planning.plan.kind === 'copy-video-aac'
          ? (['direct-stream'] as const)
          : (['transcode'] as const))

    const request = {
      requestId: createId(),
      source,
      plan: planning.plan,
      decision,
      startTime: Math.max(0, options?.startTime ?? 0),
      attemptChain: options?.attemptChain ?? [planning.plan.kind],
      attemptMethods: [...attemptMethods],
    }
    let fallbackReason: string | undefined
    let prepared = await preparationRequest(
      request.requestId,
      () => Promise.resolve(ipcClient?.media.prepare(request)),
      'job',
      options?.signal,
    )
    if (prepared && !prepared.ok) {
      const fallback = dynamicHlsFallbackRequest(request, prepared.error, createId())
      if (fallback) {
        fallbackReason = fallback.legacyTransportReason
        console.info('[media-transport-fallback]', {
          reason: fallbackReason,
          from: 'v2-stable-vod',
          to: 'v1-generation',
        })
        prepared = await preparationRequest(
          fallback.requestId,
          () => Promise.resolve(ipcClient?.media.prepare(fallback)),
          'job',
          options?.signal,
        )
      }
    }
    if (!prepared) throw new Error('兼容播放会话 IPC 不可用')
    if (!prepared.ok) throw asMediaCompatError(prepared.error)
    const sessionId = prepared.data.id
    try {
      const descriptor =
        prepared.data.status === 'ready' && prepared.data.lease
          ? prepared.data.lease
          : await waitForCompatibleLease(sessionId, options?.signal)
      console.info('[media-transport]', {
        configuredPlanner: migrationMode,
        executedPlanner: decision ? 'generalized' : 'legacy',
        transport: descriptor.hlsSessionMode === 'stable-vod' ? 'v2-stable-vod' : 'v1-generation',
        fallbackReason,
      })
      return createPlaybackSourceLease(
        descriptor,
        () => {
          void ipcClient?.media.release({ sessionId })
        },
        async (logicalTime, expectedGeneration) => {
          // 上一次 seek 可能已在 Main 创建新 generation，随后才因生产失败返回。
          // lease 只在成功时更新，因此重试必须从会话快照取得实际版本。
          const current = await ipcClient?.media.get({ sessionId })
          if (!current) throw new Error('媒体会话 IPC 不可用')
          if (!current.ok) throw asMediaCompatError(current.error)
          if (current.data.status === 'released') throw new Error('播放会话已释放，请重新加载视频')
          const seeked = await ipcClient?.media.seek({
            sessionId,
            expectedGeneration: current.data.activeGeneration ?? expectedGeneration,
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
        (position) => {
          void ipcClient?.media.reportPlayback({ sessionId, position }).catch(console.warn)
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
