import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { HlsGenerationPublisher } from './hls-generation-publisher'
import { MediaGatewayRegistry } from './registry'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

const setup = async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'marchen-hls-publisher-'))
  temporaryDirectories.push(outputDirectory)
  const registry = new MediaGatewayRegistry()
  const registration = registry.createSession('hash')
  const publisher = new HlsGenerationPublisher({
    registry,
    sessionId: registration.id,
    token: registration.token,
    generation: 0,
    outputDirectory,
  })
  return { outputDirectory, registry, registration, publisher }
}

const manifest = (segments: Array<{ name: string; duration: number }>, ended = false) =>
  [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    '#EXT-X-MAP:URI="init.mp4"',
    ...segments.flatMap((segment) => [`#EXTINF:${segment.duration},`, segment.name]),
    ...(ended ? ['#EXT-X-ENDLIST'] : []),
    '',
  ].join('\n')

describe('hLS generation 原子发布与就绪门禁', () => {
  it('先登记全部引用，再原子发布独立 manifest 快照', async () => {
    const { outputDirectory, registry, registration, publisher } = await setup()
    await Promise.all([
      writeFile(join(outputDirectory, 'init.mp4'), 'init'),
      writeFile(join(outputDirectory, 'segment-00000.m4s'), 'first'),
      writeFile(join(outputDirectory, 'segment-00001.m4s'), 'second'),
      writeFile(
        join(outputDirectory, 'index.m3u8'),
        manifest([
          { name: 'segment-00000.m4s', duration: 1 },
          { name: 'segment-00001.m4s', duration: 1.1 },
        ]),
      ),
    ])

    await expect(publisher.refresh()).resolves.toMatchObject({
      published: true,
      ready: true,
      segmentCount: 2,
      segmentDuration: 2.1,
    })
    expect(registry.resolve(registration.token, 0, 'init.mp4')?.complete).toBe(true)
    expect(registry.resolve(registration.token, 0, 'segment-00001.m4s')?.complete).toBe(true)
    const publishedManifest = registry.resolve(registration.token, 0, 'index.m3u8')
    expect(publishedManifest?.path).toContain('/published/index.m3u8')
    expect(await readFile(publishedManifest!.path, 'utf8')).toContain('segment-00001.m4s')
  })

  it('清单引用缺失或临时资源时不暴露清单', async () => {
    const { outputDirectory, registry, registration, publisher } = await setup()
    await writeFile(join(outputDirectory, 'init.mp4'), 'init')
    await writeFile(
      join(outputDirectory, 'index.m3u8'),
      manifest([{ name: 'segment-00000.m4s', duration: 2 }]),
    )
    expect(await publisher.refresh()).toMatchObject({ published: false, ready: false })
    expect(registry.resolve(registration.token, 0, 'index.m3u8')).toBeUndefined()

    await mkdir(join(outputDirectory, 'segment-00000.m4s.tmp'))
    await writeFile(
      join(outputDirectory, 'index.m3u8'),
      manifest([{ name: 'segment-00000.m4s.tmp', duration: 2 }]),
    )
    expect(await publisher.refresh()).toMatchObject({ published: false, ready: false })
  })

  it('不足约 2 秒时继续等待，短片 ENDLIST 可直接 ready', async () => {
    const { outputDirectory, publisher } = await setup()
    await writeFile(join(outputDirectory, 'init.mp4'), 'init')
    await writeFile(join(outputDirectory, 'segment-00000.m4s'), 'first')
    await writeFile(
      join(outputDirectory, 'index.m3u8'),
      manifest([{ name: 'segment-00000.m4s', duration: 1 }]),
    )
    expect(await publisher.refresh()).toMatchObject({ published: true, ready: false })

    await writeFile(
      join(outputDirectory, 'index.m3u8'),
      manifest([{ name: 'segment-00000.m4s', duration: 1 }], true),
    )
    expect(await publisher.refresh()).toMatchObject({ published: true, ready: true })
  })

  it('达到时长门槛后必须先通过 Producer Validator 才发布', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'marchen-hls-publisher-'))
    temporaryDirectories.push(outputDirectory)
    const registry = new MediaGatewayRegistry()
    const registration = registry.createSession('hash')
    const validateReady = vi.fn().mockRejectedValue(new Error('invalid first segment'))
    const publisher = new HlsGenerationPublisher({
      registry,
      sessionId: registration.id,
      token: registration.token,
      generation: 0,
      outputDirectory,
      validateReady,
    })
    await Promise.all([
      writeFile(join(outputDirectory, 'init.mp4'), 'init'),
      writeFile(join(outputDirectory, 'segment-00000.m4s'), 'first'),
      writeFile(
        join(outputDirectory, 'index.m3u8'),
        manifest([{ name: 'segment-00000.m4s', duration: 2 }]),
      ),
    ])

    await expect(publisher.refresh()).rejects.toThrow('invalid first segment')
    expect(validateReady).toHaveBeenCalledWith(
      expect.objectContaining({ firstSegmentPath: join(outputDirectory, 'segment-00000.m4s') }),
    )
    expect(registry.resolve(registration.token, 0, 'index.m3u8')).toBeUndefined()
  })
})
