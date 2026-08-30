import type { GatewayResource, MediaGatewayRegistry } from './registry'
import { readFile, rename } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

export interface PublishGatewayResourceOptions extends Omit<GatewayResource, 'complete' | 'path'> {
  sessionId: string
  token: string
  generation: number
  name: string
  temporaryPath: string
  finalPath: string
}

const referencedHlsResources = (manifest: string): string[] => {
  const resources: string[] = []
  for (const line of manifest.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (!trimmed.startsWith('#')) resources.push(trimmed)
    for (const match of trimmed.matchAll(/URI="([^"]+)"/g)) resources.push(match[1]!)
  }
  return resources
}

export const publishGatewayResource = async (
  registry: MediaGatewayRegistry,
  options: PublishGatewayResourceOptions,
): Promise<void> => {
  if (
    dirname(options.temporaryPath) !== dirname(options.finalPath) ||
    basename(options.finalPath) !== options.name
  ) {
    throw new TypeError('Gateway 资源必须在同一目录内原子发布，且文件名必须匹配路由名')
  }

  if (options.name.endsWith('.m3u8')) {
    const manifest = await readFile(options.temporaryPath, 'utf8')
    for (const name of referencedHlsResources(manifest)) {
      if (!registry.resolve(options.token, options.generation, name)?.complete) {
        throw new Error(`HLS 清单引用尚未发布的资源：${name}`)
      }
    }
  }

  await rename(options.temporaryPath, options.finalPath)
  registry.registerResource(options.sessionId, options.generation, options.name, {
    path: options.finalPath,
    mimeType: options.mimeType,
    cacheControl: options.cacheControl,
    complete: true,
  })
}
