import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DynamicHlsRequestCoordinator } from './dynamic-hls-coordinator'
import { createClosedGopTimeline } from './hls-timeline'
import { MediaGatewayRegistry } from './registry'
import { MediaGatewayRouter } from './router'
import { SegmentStore } from './segment-store'
import { MediaGatewayServer } from './server'

const temporaryDirectories: string[] = []
const servers: MediaGatewayServer[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()))
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

const resource = (path: string) => ({
  path,
  mimeType: 'video/iso.segment',
  cacheControl: 'private, max-age=31536000, immutable',
  complete: true,
  sizeBytes: 7,
})

const setup = () => {
  const timeline = createClosedGopTimeline({
    sourceStartTime: 0,
    duration: 4,
    targetSegmentDuration: 2,
  })
  const store = new SegmentStore('session', timeline)
  const coordinator = new DynamicHlsRequestCoordinator()
  return { store, coordinator }
}

describe('Dynamic HLS request coordinator', () => {
  it('同步生产异常可重试，已取消请求不启动 Job', async () => {
    const { store, coordinator } = setup()
    const request = vi.fn().mockImplementationOnce(() => { throw new Error('同步失败') }).mockImplementationOnce(() => { store.publish(0, resource('/new')) })
    coordinator.register('token', store, { request })
    await expect(coordinator.requestSegment('token', 0)).rejects.toThrow('同步失败')
    const result = await coordinator.requestSegment('token', 0)
    result?.release()
    const controller = new AbortController(); controller.abort(new Error('取消'))
    await expect(coordinator.requestSegment('token', 1, { signal: controller.signal })).rejects.toThrow('取消')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('旧请求迟到失败不会结束新请求的生产', async () => {
    const { store, coordinator } = setup()
    let rejectOld!: (error: Error) => void
    const old = new Promise<void>((_resolve, reject) => { rejectOld = reject })
    const request = vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce(undefined)
    coordinator.register('token', store, { request })
    const first = coordinator.requestSegment('token', 1)
    store.fail(1, { code: 'cancelled', stage: 'transcode', message: '旧 Job 已停止', recoverable: true })
    await expect(first).rejects.toThrow('旧 Job')
    const next = coordinator.requestSegment('token', 1)
    rejectOld(new Error('迟到失败'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(store.snapshot.entries[1]?.status).toBe('producing')
    store.publish(1, resource('/new'))
    const acquired = await next
    expect(acquired?.resource.path).toBe('/new')
    acquired?.release()
  })

  it('并发缺失请求只触发一次 production，发布后各自 acquire/release', async () => {
    const { store, coordinator } = setup()
    let publish!: () => void
    const request = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          publish = () => {
            store.publish(1, resource('/cache/segment-1.m4s'))
            resolve()
          }
        }),
    )
    coordinator.register('token', store, { request })
    const first = coordinator.requestSegment('token', 1)
    const second = coordinator.requestSegment('token', 1)
    expect(request).toHaveBeenCalledOnce()
    expect(store.snapshot.entries[1]?.waiterCount).toBe(2)
    publish()
    const acquired = await Promise.all([first, second])
    expect(store.snapshot.entries[1]?.activeRequestCount).toBe(2)
    acquired.forEach((item) => item?.release())
    expect(store.snapshot.entries[1]?.activeRequestCount).toBe(0)
  })

  it('取消一个 waiter 不停止共享 production，其他请求仍成功', async () => {
    const { store, coordinator } = setup()
    let publish!: () => void
    coordinator.register('token', store, {
      request: () =>
        new Promise<void>((resolve) => {
          publish = () => {
            store.publish(0, resource('/cache/segment-0.m4s'))
            resolve()
          }
        }),
    })
    const controller = new AbortController()
    const cancelled = coordinator.requestSegment('token', 0, { signal: controller.signal })
    const retained = coordinator.requestSegment('token', 0)
    controller.abort(new Error('client closed'))
    await expect(cancelled).rejects.toThrow('client closed')
    expect(store.snapshot.entries[0]?.status).toBe('producing')
    publish()
    const acquired = await retained
    expect(acquired?.resource.path).toContain('segment-0')
    acquired?.release()
  })

  it('Router 等待缺失 segment，流结束后释放 active request', async () => {
    const root = await mkdtemp(join(tmpdir(), 'marchen-dynamic-route-'))
    temporaryDirectories.push(root)
    const file = join(root, 'segment.m4s')
    await writeFile(file, 'segment')
    const registry = new MediaGatewayRegistry()
    const session = registry.createSession('source')
    const store = new SegmentStore(
      session.id,
      createClosedGopTimeline({ sourceStartTime: 0, duration: 2, targetSegmentDuration: 2 }),
    )
    const coordinator = new DynamicHlsRequestCoordinator()
    coordinator.register(session.token, store, {
      request: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        store.publish(0, resource(file))
      },
    })
    const router = new MediaGatewayRouter(registry, {
      isOriginAllowed: (origin) => origin === 'http://renderer.local',
      dynamicHlsV2Enabled: true,
      dynamicHlsCoordinator: coordinator,
    })
    const server = new MediaGatewayServer(router.handle)
    servers.push(server)
    const url = await server.start()
    const response = await fetch(`${url}/v2/media/${session.token}/segments/0.m4s`, {
      headers: { Origin: 'http://renderer.local' },
    })
    expect(await response.text()).toBe('segment')
    await vi.waitFor(() => expect(store.snapshot.entries[0]?.activeRequestCount).toBe(0))
  })
})
