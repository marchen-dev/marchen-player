import { randomBytes, randomUUID } from 'node:crypto'

const RESOURCE_NAME = /^[a-z0-9][\w.-]{0,127}$/i

export interface GatewayResource {
  path: string
  mimeType: string
  cacheControl: string
  complete: boolean
}

interface GatewaySession {
  id: string
  token: string
  logicalSourceId: string
  resources: Map<string, GatewayResource>
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

  releaseSession(sessionId: string): boolean {
    const session = this.#sessionsById.get(sessionId)
    if (!session) return false
    this.#sessionsById.delete(session.id)
    this.#sessionsByToken.delete(session.token)
    session.resources.clear()
    return true
  }
}
