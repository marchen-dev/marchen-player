import type { PlaybackError } from '@marchen/playback-core'
import type { HlsFactory, HlsLike } from '../adapters/hls-playback-controller'
import { describe, expect, it, vi } from 'vitest'
import { ManagedHlsPlaybackController } from '../adapters/hls-playback-controller'

const setup = (supported = true) => {
  const listeners = new Map<string, (_event: string, data: unknown) => void>()
  const instance: HlsLike = {
    on: vi.fn((event, listener) => listeners.set(event, listener)),
    attachMedia: vi.fn(),
    loadSource: vi.fn(),
    startLoad: vi.fn(),
    recoverMediaError: vi.fn(),
    destroy: vi.fn(),
  }
  let configuration: Record<string, unknown> | undefined
  const factory: HlsFactory = {
    supported,
    events: { mediaAttached: 'attached', bufferCreated: 'buffer-created', error: 'error' },
    errorTypes: { network: 'network', media: 'media' },
    create: vi.fn((config) => {
      configuration = config
      return instance
    }),
  }
  const errors: PlaybackError[] = []
  const controller = new ManagedHlsPlaybackController(
    {} as HTMLVideoElement,
    (error) => errors.push(error),
    factory,
  )
  return { controller, instance, listeners, errors, configuration: () => configuration }
}

describe('hLS/MSE 客户端适配层', () => {
  it('使用显式 Worker、CORS 与有限 buffer 配置，并在 SourceBuffer 建立后确认 attach', async () => {
    const { controller, instance, listeners, configuration } = setup()
    const attached = controller.load('http://127.0.0.1/index.m3u8')
    const config = configuration()!
    expect(config).toMatchObject({
      enableWorker: true,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      maxBufferSize: 64 * 1024 * 1024,
      backBufferLength: 30,
    })
    expect(config.workerPath).toEqual(expect.any(String))
    const xhr = { withCredentials: true } as XMLHttpRequest
    ;(config.xhrSetup as (xhr: XMLHttpRequest) => void)(xhr)
    expect(xhr.withCredentials).toBe(false)
    listeners.get('attached')?.('attached', {})
    expect(instance.loadSource).toHaveBeenCalledWith('http://127.0.0.1/index.m3u8')
    listeners.get('buffer-created')?.('buffer-created', {})
    await expect(attached).resolves.toBeUndefined()
  })

  it('网络最多恢复两次，媒体错误最多恢复一次，之后上报 fatal', () => {
    const { controller, instance, listeners, errors } = setup()
    void controller.load('http://127.0.0.1/index.m3u8').catch(() => undefined)
    const emit = (type: string) => listeners.get('error')?.('error', { fatal: true, type })
    emit('network')
    emit('network')
    emit('network')
    expect(instance.startLoad).toHaveBeenCalledTimes(2)
    expect(errors[0]?.code).toBe('network')

    emit('media')
    emit('media')
    expect(instance.recoverMediaError).toHaveBeenCalledOnce()
    expect(errors[1]?.code).toBe('decode')
    expect(errors[1]?.cause).toMatchObject({ stage: 'decode', code: 'decode-failed' })
  })

  it('换源和 destroy 都销毁旧实例；MSE 不支持时明确报错', () => {
    const active = setup()
    void active.controller.load('first.m3u8')
    void active.controller.load('second.m3u8')
    active.controller.destroy()
    expect(active.instance.destroy).toHaveBeenCalledTimes(2)

    const unsupported = setup(false)
    void unsupported.controller.load('unsupported.m3u8').catch(() => undefined)
    expect(unsupported.errors[0]).toMatchObject({ code: 'not-supported', recoverable: false })
    expect(unsupported.errors[0]?.cause).toMatchObject({ stage: 'mse', code: 'mse-attach-failed' })
  })

  it('manifest 与 SourceBuffer fatal 能区分诊断阶段', () => {
    const manifest = setup()
    void manifest.controller.load('index.m3u8').catch(() => undefined)
    manifest.listeners.get('error')?.('error', {
      fatal: true,
      type: 'network',
      details: 'manifestLoadError',
    })
    manifest.listeners.get('error')?.('error', {
      fatal: true,
      type: 'network',
      details: 'manifestLoadError',
    })
    manifest.listeners.get('error')?.('error', {
      fatal: true,
      type: 'network',
      details: 'manifestLoadError',
    })
    expect(manifest.errors[0]?.cause).toMatchObject({ stage: 'manifest-validation' })

    const mse = setup()
    void mse.controller.load('index.m3u8').catch(() => undefined)
    mse.listeners.get('error')?.('error', {
      fatal: true,
      type: 'media',
      details: 'bufferAddCodecError',
    })
    mse.listeners.get('error')?.('error', {
      fatal: true,
      type: 'media',
      details: 'bufferAddCodecError',
    })
    expect(mse.errors[0]?.cause).toMatchObject({ stage: 'mse' })
  })
})
