import type { GenerationSpanSink } from '@main/telemetry/media-generation'
import type {
  AcknowledgeMediaSessionRequest,
  MediaCompatError,
  MediaSessionSnapshot,
  PrepareDirectMediaSessionRequest,
  PrepareMediaSessionRequest,
  SeekMediaSessionRequest,
} from '@marchen/shared/media'
import type { CompatibleMediaSession, CompatibleSessionFactory } from './compatible-session-factory'
import type { MediaGatewayRegistry } from './registry'
import type { DynamicHlsLifecycleEvent } from './dynamic-hls-session-lifecycle'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { MediaGenerationTelemetryObserver } from '@main/telemetry/media-generation'
import { playbackModeForOutputProfile, toMediaSessionIpcSnapshot } from '@marchen/shared/media'
import { toMediaCompatError } from './errors'
import { cancelledPreparation } from './preparation'

interface InternalMediaSession {
  snapshot: MediaSessionSnapshot
  requestId: string
  token: string
  sourcePath: string
  compatible?: CompatibleMediaSession
  unsubscribe?: () => void
  releasePromise?: Promise<void>
  released?: boolean
}

export class MediaSessionControllerError extends Error {
  constructor(readonly detail: MediaCompatError) {
    super(detail.message)
    this.name = 'MediaSessionControllerError'
  }
}

const sessionError = (code: MediaCompatError['code'], message: string) =>
  new MediaSessionControllerError({ code, message, recoverable: true })

export class MediaSessionController {
  readonly #sessions = new Map<string, InternalMediaSession>()
  readonly #requests = new Map<string, string>()
  #cleanupEpoch = 0
  readonly #preparations = new Map<string, AbortController>()

  async preparation<T>(
    requestId: string,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController()
    this.#preparations.set(requestId, controller)
    try {
      return await operation(controller.signal)
    } finally {
      if (this.#preparations.get(requestId) === controller) this.#preparations.delete(requestId)
    }
  }

  async cancelPreparation(requestId: string): Promise<void> {
    this.#preparations.get(requestId)?.abort(cancelledPreparation())
    const sessionId = this.#requests.get(requestId)
    if (sessionId) await this.release(sessionId)
  }

  constructor(
    private readonly registry: MediaGatewayRegistry,
    private readonly gatewayUrl: () => string | undefined,
    private readonly createCompatibleSession?: CompatibleSessionFactory,
    private readonly generationSpanSink?: GenerationSpanSink,
  ) {}

  async create(request: PrepareMediaSessionRequest): Promise<MediaSessionSnapshot> {
    return this.preparation(request.requestId, (signal) => this.#create(request, signal))
  }

  async #create(
    request: PrepareMediaSessionRequest,
    signal: AbortSignal,
  ): Promise<MediaSessionSnapshot> {
    const cleanupEpoch = this.#cleanupEpoch
    if (request.plan.kind === 'native') {
      throw sessionError('unknown', 'native 播放不创建兼容会话')
    }
    const mode = playbackModeForOutputProfile(request.plan.kind) as Exclude<
      ReturnType<typeof playbackModeForOutputProfile>,
      'direct'
    >
    const existingId = this.#requests.get(request.requestId)
    if (existingId) return this.get(existingId)
    const gatewayUrl = this.gatewayUrl()
    if (!gatewayUrl) throw sessionError('gateway-unavailable', 'Media Gateway 尚未就绪')
    try {
      await access(request.source.path, constants.R_OK)
    } catch (cause) {
      throw new MediaSessionControllerError({
        code: 'source-unavailable',
        message: '原始媒体文件不可读取',
        recoverable: false,
        cause: cause instanceof Error ? cause.message : String(cause),
      })
    }

    if (cleanupEpoch !== this.#cleanupEpoch)
      throw sessionError('cancelled', '媒体会话准备期间已清理')
    signal.throwIfAborted()
    const registration = this.registry.createSession(request.source.hash)
    const snapshot: MediaSessionSnapshot = {
      id: registration.id,
      logicalSourceId: request.source.hash,
      mode,
      profile: request.plan.kind,
      attemptChain: request.attemptChain ?? [request.plan.kind],
      attemptMethods: request.attemptMethods,
      status: 'preparing',
      phase: request.plan.kind === 'copy-video-aac' ? 'planning' : 'encoder-check',
      activeGeneration: 0,
    }
    const internal: InternalMediaSession = {
      snapshot,
      requestId: request.requestId,
      token: registration.token,
      sourcePath: request.source.path,
    }
    this.#sessions.set(registration.id, internal)
    this.#requests.set(request.requestId, registration.id)
    if (!this.createCompatibleSession) return toMediaSessionIpcSnapshot(snapshot)

    try {
      const compatible = await this.createCompatibleSession({
        registration,
        request,
        gatewayUrl,
        signal,
      })
      // factory 的预检可能跨过窗口关闭/切源；迟到会话不得再启动 FFmpeg。
      if (internal.released) {
        await compatible.release()
        throw sessionError('cancelled', '媒体会话准备期间已释放')
      }
      internal.compatible = compatible
      const generationTelemetry = this.generationSpanSink
        ? new MediaGenerationTelemetryObserver(mode, this.generationSpanSink)
        : undefined
      const unsubscribe = compatible.subscribe((event) => {
        if (event.type === 'session-changed') internal.snapshot = event.session
        generationTelemetry?.observe(event)
      })
      internal.unsubscribe = () => {
        unsubscribe()
        generationTelemetry?.dispose()
      }
      internal.snapshot = await compatible.start()
      if (internal.released) throw sessionError('cancelled', '媒体会话启动期间已释放')
      return toMediaSessionIpcSnapshot(internal.snapshot)
    } catch (cause) {
      await internal.compatible?.release()
      internal.unsubscribe?.()
      this.registry.releaseSession(registration.id)
      this.#sessions.delete(registration.id)
      this.#requests.delete(request.requestId)
      throw new MediaSessionControllerError(
        toMediaCompatError(cause, {
          code: 'generation-failed',
          message: '兼容播放会话启动失败',
          recoverable: true,
          profile: request.plan.kind,
          attemptChain: request.attemptChain ?? [request.plan.kind],
        }),
      )
    }
  }

  async createDirect(request: PrepareDirectMediaSessionRequest): Promise<MediaSessionSnapshot> {
    const cleanupEpoch = this.#cleanupEpoch
    const existingId = this.#requests.get(request.requestId)
    if (existingId) return this.get(existingId)
    const baseUrl = this.gatewayUrl()
    if (!baseUrl) throw sessionError('gateway-unavailable', 'Media Gateway 尚未就绪')
    try {
      await access(request.source.path, constants.R_OK)
    } catch (cause) {
      throw new MediaSessionControllerError({
        code: 'source-unavailable',
        message: '原始媒体文件不可读取',
        recoverable: false,
        cause: cause instanceof Error ? cause.message : String(cause),
      })
    }
    if (cleanupEpoch !== this.#cleanupEpoch)
      throw sessionError('cancelled', '直放会话准备期间已清理')
    const registration = this.registry.createSession(request.source.hash)
    this.registry.registerSource(registration.id, {
      path: request.source.path,
      mimeType: request.source.name.toLowerCase().endsWith('.mkv')
        ? 'video/x-matroska'
        : 'video/mp4',
      cacheControl: 'private, no-store',
      complete: true,
    })
    const snapshot: MediaSessionSnapshot = {
      id: registration.id,
      logicalSourceId: request.source.hash,
      mode: 'direct',
      status: 'ready',
      lease: {
        id: registration.id,
        logicalSourceId: request.source.hash,
        mode: 'direct',
        transport: 'http-range',
        url: `${baseUrl}/v1/media/${registration.token}/source`,
        sessionId: registration.id,
        timeline: { originalDuration: 0, offset: 0, calibrated: false },
      },
    }
    this.#sessions.set(registration.id, {
      snapshot,
      requestId: request.requestId,
      token: registration.token,
      sourcePath: request.source.path,
    })
    this.#requests.set(request.requestId, registration.id)
    return toMediaSessionIpcSnapshot(snapshot)
  }

  reportPlayback(sessionId: string, position: number): void {
    const session = this.#sessions.get(sessionId)
    if (!session || session.released) return
    session.compatible?.reportPlayback?.(position)
  }

  get(sessionId: string): MediaSessionSnapshot {
    const session = this.#sessions.get(sessionId)
    if (!session) throw sessionError('session-not-found', '媒体会话不存在')
    return toMediaSessionIpcSnapshot(session.snapshot)
  }

  acknowledge(request: AcknowledgeMediaSessionRequest): MediaSessionSnapshot {
    const session = this.#sessions.get(request.sessionId)
    if (!session?.compatible || session.snapshot.status === 'released') {
      throw sessionError('session-expired', '兼容媒体会话已经释放')
    }
    const browserError = request.phase === 'failed' ? request.error : undefined
    try {
      session.snapshot = session.compatible.acknowledge(
        request.generation,
        request.phase,
        browserError,
      )
      return toMediaSessionIpcSnapshot(session.snapshot)
    } catch (cause) {
      throw new MediaSessionControllerError({
        code: 'generation-failed',
        stage:
          request.phase === 'attaching'
            ? 'mse'
            : request.phase === 'playable'
              ? 'decode'
              : browserError?.stage,
        message: '浏览器播放阶段确认失败',
        recoverable: true,
        cause: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  async seek(request: SeekMediaSessionRequest): Promise<MediaSessionSnapshot> {
    const session = this.#sessions.get(request.sessionId)
    if (!session || session.snapshot.status === 'released') {
      throw sessionError('session-expired', '媒体会话已经释放')
    }
    if (session.compatible) {
      try {
        session.snapshot = await session.compatible.seek(
          request.expectedGeneration,
          request.logicalTime,
        )
        return toMediaSessionIpcSnapshot(session.snapshot)
      } catch (cause) {
        throw new MediaSessionControllerError({
          code: 'generation-failed',
          message: cause instanceof Error ? cause.message : 'seek generation 启动失败',
          recoverable: true,
        })
      }
    }
    if (session.snapshot.activeGeneration !== request.expectedGeneration) {
      throw sessionError('generation-failed', 'seek generation 已过期')
    }
    session.snapshot = {
      ...session.snapshot,
      status: 'preparing',
      activeGeneration: request.expectedGeneration + 1,
      lease: undefined,
    }
    return toMediaSessionIpcSnapshot(session.snapshot)
  }

  async release(
    sessionId: string,
    event: DynamicHlsLifecycleEvent = 'release',
  ): Promise<MediaSessionSnapshot> {
    const session = this.#sessions.get(sessionId)
    if (!session) throw sessionError('session-not-found', '媒体会话不存在')
    session.released = true
    session.releasePromise ??= (async () => {
      if (session.compatible?.handleLifecycle) await session.compatible.handleLifecycle(event)
      else if (session.compatible) await session.compatible.release()
      session.unsubscribe?.()
      session.unsubscribe = undefined
      this.registry.releaseSession(sessionId)
      this.#requests.delete(session.requestId)
      session.snapshot = { ...session.snapshot, status: 'released', lease: undefined }
    })()
    await session.releasePromise
    return toMediaSessionIpcSnapshot(session.snapshot)
  }

  async releaseAll(event: DynamicHlsLifecycleEvent = 'release'): Promise<void> {
    this.#cleanupEpoch += 1
    for (const controller of this.#preparations.values()) controller.abort(cancelledPreparation())
    const releases = [...this.#sessions.keys()].map((sessionId) => this.release(sessionId, event))
    this.#sessions.clear()
    this.#requests.clear()
    const results = await Promise.allSettled(releases)
    const failures = results.filter((result) => result.status === 'rejected')
    if (failures.length)
      throw new AggregateError(
        failures.map((result) => result.reason),
        '媒体会话清理失败',
      )
  }
}
