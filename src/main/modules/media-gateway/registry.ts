import { randomBytes, randomUUID } from 'node:crypto'

const RESOURCE_NAME = /^[a-z0-9][\w.-]{0,127}$/i

export interface GatewayResource {
  path: string
  mimeType: string
  cacheControl: string
  complete: boolean
  sizeBytes?: number
}

interface GatewaySession {
  id: string
  token: string
  logicalSourceId: string
  resources: Map<string, GatewayResource>
  stableResources: Map<string, GatewayResource>
  source?: GatewayResource
}

export interface GatewaySessionRegistration {
  id: string
  token: string
  logicalSourceId: string
}

const resourceKey = (generation: number, name: string) => `${generation}:${name}`

export class MediaGatewayRegistry {
  readonly #sessionsById = new Map<string, GatewaySession>()
  readonly #sessionsByToken = new Map<string, GatewaySession>()

  createSession(logicalSourceId: string): GatewaySessionRegistration {
    const session: GatewaySession = {
      id: randomUUID(),
      token: randomBytes(32).toString('base64url'),
      logicalSourceId,
      resources: new Map(),
      stableResources: new Map(),
    }
    this.#sessionsById.set(session.id, session)
    this.#sessionsByToken.set(session.token, session)
    return { id: session.id, token: session.token, logicalSourceId }
  }

  registerResource(
    sessionId: string,
    generation: number,
    name: string,
    resource: GatewayResource,
  ): void {
    if (!Number.isSafeInteger(generation) || generation < 0 || !RESOURCE_NAME.test(name)) {
      throw new TypeError('Gateway 资源标识无效')
    }
    const session = this.#sessionsById.get(sessionId)
    if (!session) throw new Error('Gateway 会话不存在')
    session.resources.set(resourceKey(generation, name), { ...resource })
  }

  registerSource(sessionId: string, resource: GatewayResource): void {
    const session = this.#sessionsById.get(sessionId)
    if (!session) throw new Error('Gateway 会话不存在')
    session.source = { ...resource }
  }

  resolveSource(token: string): GatewayResource | undefined {
    return this.#sessionsByToken.get(token)?.source
  }

  resolve(token: string, generation: number, name: string): GatewayResource | undefined {
    if (!RESOURCE_NAME.test(name)) return undefined
    return this.#sessionsByToken.get(token)?.resources.get(resourceKey(generation, name))
  }

  registerStableResource(sessionId: string, name: string, resource: GatewayResource): void {
    if (!RESOURCE_NAME.test(name)) throw new TypeError('Gateway 稳定资源标识无效')
    const session = this.#sessionsById.get(sessionId)
    if (!session) throw new Error('Gateway 会话不存在')
    if (session.stableResources.has(name)) throw new Error('Gateway 稳定资源已经发布且不可覆盖')
    session.stableResources.set(name, { ...resource })
  }

  resolveStable(token: string, name: string): GatewayResource | undefined {
    if (!RESOURCE_NAME.test(name)) return undefined
    return this.#sessionsByToken.get(token)?.stableResources.get(name)
  }

  /** 仅用于 SegmentStore 已完成驱逐的条目；仍在发布态的资源不能调用此接口覆盖。 */
  unregisterEvictedResource(sessionId: string, name: string): void {
    this.#sessionsById.get(sessionId)?.stableResources.delete(name)
  }

  releaseSession(sessionId: string): boolean {
    const session = this.#sessionsById.get(sessionId)
    if (!session) return false
    this.#sessionsById.delete(session.id)
    this.#sessionsByToken.delete(session.token)
    session.resources.clear()
    session.stableResources.clear()
    return true
  }
}
