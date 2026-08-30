import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MediaPipelineError } from './errors'
import { MediaGatewayRegistry } from './registry'
import { MediaSessionController, MediaSessionControllerError } from './session-controller'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

describe('mediaSessionController IPC 生命周期', () => {
  it('兼容会话支持幂等创建、查询、seek generation 和释放', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'marchen-session-controller-'))
    temporaryDirectories.push(directory)
    const input = join(directory, 'video.mkv')
    await writeFile(input, 'video')
    const registry = new MediaGatewayRegistry()
    const controller = new MediaSessionController(registry, () => 'http://127.0.0.1:1234')
    const request = {
      requestId: 'request-1',
      source: {
        kind: 'electron-file' as const,
        path: input,
        hash: 'hash',
        name: 'video.mkv',
        size: 5,
      },
      plan: {
        kind: 'copy-video-aac' as const,
        reason: 'container-incompatible' as const,
        videoStreamIndex: 0,
        audioStreamIndex: 1,
        video: 'copy' as const,
        audio: {
          codec: 'aac' as const,
          profile: 'aac_low' as const,
          sampleRate: 48_000 as const,
          channels: 2 as const,
        },
        startupDeadlineMs: 8_000,
      },
      startTime: 0,
    }

    const created = await controller.create(request)
    expect(created).toMatchObject({
      status: 'preparing',
      activeGeneration: 0,
      profile: 'copy-video-aac',
      attemptChain: ['copy-video-aac'],
    })
    expect(await controller.create(request)).toEqual(created)
    expect(controller.get(created.id)).toEqual(created)
    const seeked = await controller.seek({
      sessionId: created.id,
      expectedGeneration: 0,
      logicalTime: 30,
    })
    expect(seeked).toMatchObject({ status: 'preparing', activeGeneration: 1 })
    await expect(
      controller.seek({ sessionId: created.id, expectedGeneration: 0, logicalTime: 40 }),
    ).rejects.toThrow('过期')
    expect(await controller.release(created.id)).toMatchObject({ status: 'released' })
    expect(await controller.release(created.id)).toMatchObject({ status: 'released' })
  })

  it('native 不创建兼容会话', async () => {
    const controller = new MediaSessionController(
      new MediaGatewayRegistry(),
      () => 'http://127.0.0.1:1',
    )
    await expect(
      controller.create({
        requestId: 'native',
        source: {
          kind: 'electron-file',
          path: '/missing',
          hash: 'hash',
          name: 'video.mp4',
          size: 1,
        },
        plan: { kind: 'native', reason: 'native-compatible', videoStreamIndex: 0 },
        startTime: 0,
      }),
    ).rejects.toThrow('native')
  })

  it('创建失败时跨 IPC 边界保留 pipeline 阶段诊断', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'marchen-session-error-'))
    temporaryDirectories.push(directory)
    const input = join(directory, 'video.mkv')
    await writeFile(input, 'video')
    const controller = new MediaSessionController(
      new MediaGatewayRegistry(),
      () => 'http://127.0.0.1:1',
      async () => {
        throw new MediaPipelineError({
          code: 'pipeline-preflight-failed',
          stage: 'pipeline-preflight',
          message: '真实媒体 pipeline 预检失败',
          recoverable: true,
          exitCode: 1,
          stderrTail: 'invalid stream map',
        })
      },
    )
    const failure = controller.create({
      requestId: 'failed-pipeline',
      source: {
        kind: 'electron-file',
        path: input,
        hash: 'hash',
        name: 'video.mkv',
        size: 5,
      },
      plan: {
        kind: 'safe-h264-aac-sdr',
        reason: 'video-incompatible',
        videoStreamIndex: 0,
        video: { codec: 'h264', pixelFormat: 'yuv420p', toneMapToSdr: false },
      },
      startTime: 0,
    })
    await expect(failure).rejects.toBeInstanceOf(MediaSessionControllerError)
    await expect(failure).rejects.toMatchObject({
      detail: {
        code: 'pipeline-preflight-failed',
        stage: 'pipeline-preflight',
        exitCode: 1,
        stderrTail: 'invalid stream map',
        profile: 'safe-h264-aac-sdr',
      },
    })
  })

  it('renderer 崩溃或窗口关闭时批量撤销全部 token', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'marchen-session-cleanup-'))
    temporaryDirectories.push(directory)
    const input = join(directory, 'video.mp4')
    await writeFile(input, 'video')
    const registry = new MediaGatewayRegistry()
    const controller = new MediaSessionController(registry, () => 'http://127.0.0.1:1234')
    const session = await controller.createDirect({
      requestId: 'cleanup',
      source: {
        kind: 'electron-file',
        path: input,
        hash: 'hash',
        name: 'video.mp4',
        size: 5,
      },
    })
    const token = new URL(session.lease!.url).pathname.split('/')[3]!
    expect(registry.resolveSource(token)).toBeDefined()
    controller.releaseAll()
    expect(registry.resolveSource(token)).toBeUndefined()
    expect(() => controller.get(session.id)).toThrow('不存在')
  })
})
