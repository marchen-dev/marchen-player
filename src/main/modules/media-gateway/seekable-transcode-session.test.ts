import type {
  MediaGenerationSnapshot,
  MediaSessionEvent,
  MediaSessionSnapshot,
} from '@marchen/shared/media'
import type {
  SeekableGenerationFactoryInput,
  TranscodeGenerationHandle,
} from './seekable-transcode-session'
import { describe, expect, it, vi } from 'vitest'
import { SeekableTranscodeSession } from './seekable-transcode-session'

class FakeGeneration implements TranscodeGenerationHandle {
  readonly listeners = new Set<(event: MediaSessionEvent) => void>()
  readonly start = vi.fn(async () => {
    this.snapshot = { ...this.snapshot, status: 'ready' }
  })
  readonly release = vi.fn(async () => {
    this.snapshot = { ...this.snapshot, status: 'released', lease: undefined }
  })
  readonly acknowledge = vi.fn((phase: 'attaching' | 'playable' | 'failed') => {
    this.snapshot = { ...this.snapshot, phase }
    return this.session
  })
  snapshot: MediaSessionSnapshot
  readonly generation: MediaGenerationSnapshot

  constructor(readonly input: SeekableGenerationFactoryInput) {
    this.snapshot = {
      id: input.sessionId,
      logicalSourceId: input.logicalSourceId,
      mode: input.mode,
      status: 'preparing',
      activeGeneration: input.generation,
      lease: {
        id: `lease-${input.generation}`,
        logicalSourceId: input.logicalSourceId,
        mode: input.mode,
        transport: 'hls',
        url: `http://127.0.0.1/g/${input.generation}/index.m3u8`,
        sessionId: input.sessionId,
        generation: input.generation,
        timeline: {
          originalDuration: 120,
          offset: input.requestedStartTime + 0.04,
          calibrated: true,
        },
      },
    }
    this.generation = {
      sessionId: input.sessionId,
      generation: input.generation,
      status: 'producing',
      originalStartTime: input.originalStartTime,
      requestedStartTime: input.requestedStartTime,
      actualFirstTimestamp: 0.04,
    }
  }

  get session() {
    return structuredClone(this.snapshot)
  }

  subscribe(listener: (event: MediaSessionEvent) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

describe('seek generation 协调器', () => {
  it('先取消旧 generation，再从目标逻辑时间启动新 generation', async () => {
    const generations: FakeGeneration[] = []
    const order: string[] = []
    const session = new SeekableTranscodeSession({
      sessionId: 'session',
      logicalSourceId: 'hash',
      mode: 'transcode-video',
      originalStartTime: 5,
      initialStartTime: 10,
      createGeneration: (input) => {
        const generation = new FakeGeneration(input)
        generation.release.mockImplementation(async () => {
          order.push(`release:${input.generation}`)
        })
        generation.start.mockImplementation(async () => {
          order.push(`start:${input.generation}:${input.requestedStartTime}`)
        })
        generations.push(generation)
        return generation
      },
      createProducer: () => () => ({
        result: Promise.resolve({
          code: 0,
          signal: null,
          stdout: Buffer.alloc(0),
          stderr: '',
          durationMs: 0,
        }),
        cancel: () => {},
      }),
    })

    await session.start()
    const seeked = await session.seek(0, 45)
    expect(order).toEqual(['start:0:10', 'release:0', 'start:1:45'])
    expect(seeked).toMatchObject({
      activeGeneration: 1,
      lease: {
        generation: 1,
        timeline: { originalDuration: 120, offset: 45.04, calibrated: true },
      },
    })
  })

  it('拒绝过期 generation，并串行处理快速 seek', async () => {
    const generations: FakeGeneration[] = []
    const session = new SeekableTranscodeSession({
      sessionId: 'session',
      logicalSourceId: 'hash',
      mode: 'remux',
      originalStartTime: 0,
      initialStartTime: 0,
      createGeneration: (input) => {
        const generation = new FakeGeneration(input)
        generations.push(generation)
        return generation
      },
      createProducer: () => () => ({
        result: new Promise(() => {}),
        cancel: () => {},
      }),
    })
    await session.start()
    await expect(session.seek(9, 10)).rejects.toThrow('过期')
    await session.seek(0, 20)
    await session.seek(1, 30)
    expect(generations.map((generation) => generation.input.requestedStartTime)).toEqual([
      0, 20, 30,
    ])
    await session.release()
  })
})
