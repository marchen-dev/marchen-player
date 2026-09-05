import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DynamicHlsPublisher } from './dynamic-hls-publisher'
import { createInitFingerprintFromProbe, InitFingerprintGuard } from '../ffmpeg/init-fingerprint'
import { createClosedGopTimeline } from './hls-timeline'
import { MediaGatewayRegistry } from './registry'
import { SegmentStore } from './segment-store'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

const setup = async () => {
  const root = await mkdtemp(join(tmpdir(), 'marchen-dynamic-publisher-'))
  temporaryDirectories.push(root)
  const registry = new MediaGatewayRegistry()
  const session = registry.createSession('source')
  const store = new SegmentStore(
    session.id,
    createClosedGopTimeline({ sourceStartTime: 0, duration: 4, targetSegmentDuration: 2 }),
  )
  return { root, registry, session, store }
}

const writeWorkingOutput = async (root: string, segmentName = 'segment-00000.m4s') => {
  await writeFile(join(root, 'init.mp4'), 'init')
  await writeFile(join(root, segmentName), 'segment')
  await writeFile(
    join(root, 'index.m3u8'),
    `#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2,\n${segmentName}\n`,
  )
}

const inspection = () => ({
  ptsToleranceSeconds: 0.1,
  initFingerprintGuard: new InitFingerprintGuard(),
  inspectInitFingerprint: async () =>
    createInitFingerprintFromProbe({
      streams: [{ codec_name: 'h264', id: '1', time_base: '1/24' }],
    }),
  inspectSegment: async (_init: string, path: string) => {
    const index = Number(path.match(/segment-(\d+)/)![1])
    return { video: { start: index * 2, end: index * 2 + 2 } }
  },
})

describe('Dynamic HLS Publisher', () => {
  it('验证后提升 init/segment 到稳定 registry 与 SegmentStore', async () => {
    const { root, registry, session, store } = await setup()
    await writeWorkingOutput(root)
    const validateReady = vi.fn(async () => undefined)
    const publisher = new DynamicHlsPublisher({
      ...inspection(),
      registry,
      sessionId: session.id,
      token: session.token,
      outputDirectory: root,
      store,
      validateReady,
    })
    await expect(publisher.refresh()).resolves.toEqual({
      publishedSegments: 1,
      initPublished: true,
    })
    expect(validateReady).toHaveBeenCalledOnce()
    expect(registry.resolveStable(session.token, 'init.mp4')).toMatchObject({ complete: true })
    expect(registry.resolveStable(session.token, 'segment-0.m4s')).toMatchObject({ complete: true })
    expect(store.snapshot.initStatus).toBe('published')
    expect(store.snapshot.entries[0]).toMatchObject({ index: 0, status: 'published' })
    await expect(publisher.refresh()).resolves.toEqual({
      publishedSegments: 0,
      initPublished: false,
    })
  })

  it.each([
    { label: '无效跨度', range: { video: { start: 0, end: NaN } }, error: '实际时间' },
    { label: '未验证边界', range: { video: { start: 1, end: 3 } }, error: '未经验证' },
    {
      label: '音画错位',
      range: { video: { start: 0, end: 2 }, audio: { start: 1, end: 3 } },
      error: '音视频',
    },
  ])('拒绝 $label 且不提前发布 init', async ({ range, error }) => {
    const { root, registry, session, store } = await setup()
    await writeWorkingOutput(root)
    const publisher = new DynamicHlsPublisher({
      ...inspection(),
      registry,
      sessionId: session.id,
      token: session.token,
      outputDirectory: root,
      store,
      inspectSegment: async () => range,
    })
    await expect(publisher.refresh()).rejects.toThrow(error)
    expect(store.snapshot.initStatus).toBe('missing')
    expect(store.snapshot.entries[0]?.status).toBe('missing')
  })

  it('显式验证策略允许范围变化并保留实际范围，不改写清单', async () => {
    const { root, registry, session, store } = await setup()
    await writeWorkingOutput(root)
    const actual = { video: { start: 0.5, end: 2.5 } }
    const publisher = new DynamicHlsPublisher({
      ...inspection(),
      registry,
      sessionId: session.id,
      token: session.token,
      outputDirectory: root,
      store,
      inspectSegment: async () => actual,
      acceptBoundaryChange: ({ index, actual: value }) =>
        index === 0 && value.video.start === 0.5 && value.video.end === 2.5,
    })
    await publisher.refresh()
    expect(store.snapshot.entries[0]).toMatchObject({
      startTime: 0,
      endTime: 2,
      actualRange: actual,
    })
  })

  it.each(['segment-00000.m4s.tmp', '../segment-00000.m4s'])(
    '拒绝不安全 manifest 资源 %s',
    async (name) => {
      const { root, registry, session, store } = await setup()
      await writeFile(join(root, 'init.mp4'), 'init')
      await writeFile(join(root, 'index.m3u8'), `#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n${name}\n`)
      const publisher = new DynamicHlsPublisher({
        ...inspection(),
        registry,
        sessionId: session.id,
        token: session.token,
        outputDirectory: root,
        store,
      })
      await expect(publisher.refresh()).rejects.toThrow('不安全')
      expect(store.snapshot.initStatus).toBe('missing')
    },
  )

  it('拒绝符号链接和 validator 失败，不发布半成品', async () => {
    const linked = await setup()
    await writeFile(join(linked.root, 'real.m4s'), 'segment')
    await writeFile(join(linked.root, 'init.mp4'), 'init')
    await symlink(join(linked.root, 'real.m4s'), join(linked.root, 'segment-00000.m4s'))
    await writeFile(
      join(linked.root, 'index.m3u8'),
      '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\nsegment-00000.m4s\n',
    )
    await expect(
      new DynamicHlsPublisher({
        ...inspection(),
        registry: linked.registry,
        sessionId: linked.session.id,
        token: linked.session.token,
        outputDirectory: linked.root,
        store: linked.store,
      }).refresh(),
    ).rejects.toThrow('普通文件')

    const invalid = await setup()
    await writeWorkingOutput(invalid.root)
    await expect(
      new DynamicHlsPublisher({
        ...inspection(),
        registry: invalid.registry,
        sessionId: invalid.session.id,
        token: invalid.session.token,
        outputDirectory: invalid.root,
        store: invalid.store,
        validateReady: async () => {
          throw new Error('invalid media')
        },
      }).refresh(),
    ).rejects.toThrow('invalid media')
    expect(invalid.store.snapshot.initStatus).toBe('missing')
  })

  it('Job 重启 init fingerprint 不兼容时禁止发布新 segment', async () => {
    const first = await setup()
    await writeWorkingOutput(first.root)
    const guard = new InitFingerprintGuard()
    const fingerprint = (byte: string) =>
      createInitFingerprintFromProbe({
        streams: [
          {
            index: 0,
            id: '0x1',
            codec_name: 'h264',
            codec_tag_string: 'avc1',
            time_base: '1/12288',
            extradata: `00000000: ${byte}`,
            extradata_size: 1,
          },
        ],
      })
    await new DynamicHlsPublisher({
      ...inspection(),
      registry: first.registry,
      sessionId: first.session.id,
      token: first.session.token,
      outputDirectory: first.root,
      store: first.store,
      initFingerprintGuard: guard,
      inspectInitFingerprint: async () => fingerprint('01'),
    }).refresh()

    const nextRoot = await mkdtemp(join(tmpdir(), 'marchen-dynamic-publisher-next-'))
    temporaryDirectories.push(nextRoot)
    await writeWorkingOutput(nextRoot, 'segment-00001.m4s')
    await expect(
      new DynamicHlsPublisher({
        ...inspection(),
        registry: first.registry,
        sessionId: first.session.id,
        token: first.session.token,
        outputDirectory: nextRoot,
        store: first.store,
        initFingerprintGuard: guard,
        inspectInitFingerprint: async () => fingerprint('02'),
      }).refresh(),
    ).rejects.toThrow('fingerprint')
    expect(first.store.snapshot.entries[1]?.status).toBe('missing')
    expect(first.registry.resolveStable(first.session.token, 'segment-1.m4s')).toBeUndefined()
  })
})
