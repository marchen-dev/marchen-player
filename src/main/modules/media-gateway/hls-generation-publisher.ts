import type { MediaGatewayRegistry } from './registry'
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'

import { basename, join } from 'node:path'
import { publishGatewayResource } from './publisher'

interface ParsedManifest {
  resources: string[]
  segmentNames: string[]
  segmentDuration: number
  ended: boolean
}

export interface HlsGenerationPublisherOptions {
  registry: MediaGatewayRegistry
  sessionId: string
  token: string
  generation: number
  outputDirectory: string
  readyDuration?: number
  validateReady?: (input: {
    manifestPath: string
    initPath: string
    firstSegmentPath: string
  }) => Promise<void>
}

export interface HlsGenerationPublishResult {
  published: boolean
  ready: boolean
  segmentCount: number
  segmentDuration: number
}

const safeResourceName = (name: string): boolean =>
  basename(name) === name && /^[A-Z0-9][\w.-]{0,127}$/i.test(name)

const parseManifest = (manifest: string): ParsedManifest => {
  const resources: string[] = []
  const segmentNames: string[] = []
  let segmentDuration = 0
  let pendingDuration = 0
  for (const rawLine of manifest.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('#EXTINF:')) {
      const value = Number(line.slice('#EXTINF:'.length).split(',', 1)[0])
      pendingDuration = Number.isFinite(value) && value > 0 ? value : 0
    } else if (line && !line.startsWith('#')) {
      resources.push(line)
      segmentNames.push(line)
      segmentDuration += pendingDuration
      pendingDuration = 0
    }
    for (const match of line.matchAll(/URI="([^"]+)"/g)) resources.push(match[1]!)
  }
  return {
    resources: [...new Set(resources)],
    segmentNames,
    segmentDuration,
    ended: manifest.includes('#EXT-X-ENDLIST'),
  }
}

const mimeType = (name: string): string => {
  if (name.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl'
  if (name.endsWith('.mp4')) return 'video/mp4'
  return 'video/iso.segment'
}

/**
 * FFmpeg `temp_file` 已把 init/segment/manifest 在同目录原子 rename。
 * 这里再生成独立 manifest 快照：先登记其全部引用，最后原子替换 Gateway 可见清单，
 * 从而消除“新清单已可见但对应 segment 尚未进入 registry”的窗口。
 */
export class HlsGenerationPublisher {
  readonly #publishedDirectory: string
  readonly #readyDuration: number

  constructor(private readonly options: HlsGenerationPublisherOptions) {
    this.#publishedDirectory = join(options.outputDirectory, 'published')
    this.#readyDuration = Math.max(0.5, options.readyDuration ?? 2)
  }

  async refresh(): Promise<HlsGenerationPublishResult> {
    let manifest: string
    try {
      manifest = await readFile(join(this.options.outputDirectory, 'index.m3u8'), 'utf8')
    } catch {
      return { published: false, ready: false, segmentCount: 0, segmentDuration: 0 }
    }
    const parsed = parseManifest(manifest)
    if (
      parsed.segmentNames.length === 0 ||
      parsed.resources.some((name) => !safeResourceName(name) || name.endsWith('.tmp'))
    ) {
      return {
        published: false,
        ready: false,
        segmentCount: parsed.segmentNames.length,
        segmentDuration: parsed.segmentDuration,
      }
    }

    const durationReady =
      parsed.segmentDuration >= this.#readyDuration ||
      (parsed.ended && parsed.segmentNames.length > 0)
    if (durationReady && this.options.validateReady) {
      await this.options.validateReady({
        manifestPath: join(this.options.outputDirectory, 'index.m3u8'),
        initPath: join(this.options.outputDirectory, 'init.mp4'),
        firstSegmentPath: join(this.options.outputDirectory, parsed.segmentNames[0]!),
      })
    }

    for (const name of parsed.resources) {
      const path = join(this.options.outputDirectory, name)
      try {
        const statistics = await lstat(path)
        if (!statistics.isFile() || statistics.isSymbolicLink()) throw new Error('not complete')
      } catch {
        return {
          published: false,
          ready: false,
          segmentCount: parsed.segmentNames.length,
          segmentDuration: parsed.segmentDuration,
        }
      }
      this.options.registry.registerResource(
        this.options.sessionId,
        this.options.generation,
        name,
        {
          path,
          mimeType: mimeType(name),
          cacheControl: 'private, max-age=31536000, immutable',
          complete: true,
        },
      )
    }

    await mkdir(this.#publishedDirectory, { recursive: true })
    const temporaryPath = join(this.#publishedDirectory, `manifest-${randomUUID()}.tmp`)
    const finalPath = join(this.#publishedDirectory, 'index.m3u8')
    await writeFile(temporaryPath, manifest)
    await publishGatewayResource(this.options.registry, {
      sessionId: this.options.sessionId,
      token: this.options.token,
      generation: this.options.generation,
      name: 'index.m3u8',
      temporaryPath,
      finalPath,
      mimeType: mimeType('index.m3u8'),
      cacheControl: 'private, no-cache',
    })

    return {
      published: true,
      ready: durationReady,
      segmentCount: parsed.segmentNames.length,
      segmentDuration: parsed.segmentDuration,
    }
  }
}
