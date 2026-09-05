import type { DynamicHlsJobHandle } from './dynamic-hls-job-slot'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DynamicHlsRequestCoordinator } from './dynamic-hls-coordinator'
import { DynamicHlsJobSlot } from './dynamic-hls-job-slot'
import { createDynamicHlsManifest } from './dynamic-hls-manifest'
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

describe('Dynamic HLS Gateway 整链路', () => {
  it('保持稳定入口并处理顺序、seek、重复、并发、404 与超时', async () => {
    const root = await mkdtemp(join(tmpdir(), 'marchen-dynamic-hls-integration-'))
    temporaryDirectories.push(root)
    const timeline = createClosedGopTimeline({
      sourceStartTime: 0,
      duration: 24,
      targetSegmentDuration: 2,
    })
    const registry = new MediaGatewayRegistry()
    const session = registry.createSession('logical-source')
    const store = new SegmentStore(session.id, timeline)
    const coordinator = new DynamicHlsRequestCoordinator()
    const starts: number[] = []
    const stops: number[] = []
    let epoch = 0
    const slot = new DynamicHlsJobSlot({
      store,
      maxForwardGapSegments: 2,
      factory: {
        start: async ({ segmentIndex }): Promise<DynamicHlsJobHandle> => {
          const currentEpoch = epoch++
          starts.push(segmentIndex)
          return {
            id: `job-${currentEpoch}`,
            coverage: {
              startSegment: segmentIndex,
              endSegment: Math.min(timeline.segments.length - 1, segmentIndex + 3),
            },
            stop: async () => {
              stops.push(currentEpoch)
            },
          }
        },
      },
    })
    const productionRequests = vi.fn(async (segmentIndex: number) => {
      await slot.ensure(segmentIndex)
      const owner = slot.owner
      if (segmentIndex === 7) return new Promise<void>(() => undefined)
      await new Promise((resolve) => setTimeout(resolve, 5))
      if (store.snapshot.initStatus !== 'published') {
        const initPath = join(root, 'init.mp4')
        await writeFile(initPath, 'stable-init')
        store.publishInit({
          path: initPath,
          mimeType: 'video/mp4',
          cacheControl: 'private, max-age=31536000, immutable',
          complete: true,
          sizeBytes: 11,
        }, owner)
      }
      const path = join(root, `segment-${segmentIndex}.m4s`)
      await writeFile(path, `segment-${segmentIndex}`)
      store.publish(segmentIndex, {
        path,
        mimeType: 'video/iso.segment',
        cacheControl: 'private, max-age=31536000, immutable',
        complete: true,
        sizeBytes: `segment-${segmentIndex}`.length,
      }, undefined, owner)
    })
    coordinator.register(session.token, store, { request: productionRequests })

    const manifestPath = join(root, 'index.m3u8')
    const manifest = createDynamicHlsManifest(timeline)
    await writeFile(manifestPath, manifest)
    registry.registerStableResource(session.id, 'index.m3u8', {
      path: manifestPath,
      mimeType: 'application/vnd.apple.mpegurl',
      cacheControl: 'private, no-cache',
      complete: true,
      sizeBytes: manifest.length,
    })
    const router = new MediaGatewayRouter(registry, {
      isOriginAllowed: (origin) => origin === 'http://renderer.local',
      dynamicHlsV2Enabled: true,
      dynamicHlsCoordinator: coordinator,
      dynamicHlsRequestTimeoutMs: 30,
    })
    const server = new MediaGatewayServer(router.handle)
    servers.push(server)
    const baseUrl = await server.start()
    const stableUrl = `${baseUrl}/v2/media/${session.token}`
    const headers = { Origin: 'http://renderer.local' }
    const get = (path: string) => fetch(`${stableUrl}/${path}`, { headers })

    expect(await get('index.m3u8').then((response) => response.text())).toBe(manifest)
    expect(await get('init.mp4').then((response) => response.text())).toBe('stable-init')
    expect(await get('segments/0.m4s').then((response) => response.text())).toBe('segment-0')
    expect(await get('segments/1.m4s').then((response) => response.text())).toBe('segment-1')
    expect(await get('segments/3.m4s').then((response) => response.text())).toBe('segment-3')
    expect(starts).toEqual([0])

    expect(await get('segments/10.m4s').then((response) => response.text())).toBe('segment-10')
    expect(await get('segments/2.m4s').then((response) => response.text())).toBe('segment-2')
    expect(starts).toEqual([0, 10, 2])
    expect(stops).toEqual([0, 1])

    const requestsBeforeRepeat = productionRequests.mock.calls.length
    expect(await get('segments/2.m4s').then((response) => response.text())).toBe('segment-2')
    expect(productionRequests).toHaveBeenCalledTimes(requestsBeforeRepeat)

    const concurrent = await Promise.all([
      get('segments/5.m4s').then((response) => response.text()),
      get('segments/5.m4s').then((response) => response.text()),
    ])
    expect(concurrent).toEqual(['segment-5', 'segment-5'])
    expect(productionRequests.mock.calls.filter(([index]) => index === 5)).toHaveLength(1)

    expect((await get('segments/99.m4s')).status).toBe(404)
    expect((await get('segments/7.m4s')).status).toBe(504)
    expect(store.snapshot.entries[7]?.waiterCount).toBe(0)
    expect(stableUrl).toBe(`${baseUrl}/v2/media/${session.token}`)
  })
})
