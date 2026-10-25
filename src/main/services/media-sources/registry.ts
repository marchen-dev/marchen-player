import type { MediaSourceInput, MediaSourceSummary } from '@marchen/shared/media-sources'
import type { MediaSourceProvider, ProviderFactories } from './provider'
import type { MediaSourceRecord, MediaSourceStore } from './store'
import { randomUUID } from 'node:crypto'
import { MEDIA_SOURCE_KINDS, MediaSourceError } from '@marchen/shared/media-sources'
import { toMediaSourceError } from './errors'
import { toSummary } from './store'

type InvalidateListener = (sourceId: string | undefined) => void

/**
 * sourceId → provider 实例。负责：
 * - 添加、编辑、重新登录前的连接测试；
 * - 缓存 provider 实例，凭证变化或移除时丢弃；
 * - 任一请求返回 401 时把来源标记为需要重新登录，不无限重试、不删除来源。
 */
export class MediaSourceRegistry {
  private readonly providers = new Map<string, MediaSourceProvider>()
  private readonly listeners = new Set<InvalidateListener>()

  constructor(
    private readonly store: MediaSourceStore,
    private readonly factories: ProviderFactories,
  ) {}

  /** 来源被移除、重新登录或重置时通知租约与海报缓存清理；undefined 表示全部来源 */
  onInvalidate(listener: InvalidateListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private invalidate(sourceId?: string) {
    if (sourceId) this.providers.delete(sourceId)
    else this.providers.clear()
    for (const listener of this.listeners) listener(sourceId)
  }

  async list(): Promise<MediaSourceSummary[]> {
    return (await this.store.list()).map(toSummary)
  }

  async add(input: MediaSourceInput): Promise<MediaSourceSummary> {
    const record = await this.connect(input, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    })
    await this.store.save(record)
    return toSummary(record)
  }

  /**
   * 编辑：只改名称时不需要重新测试；地址、账号或类型变化必须带密码重新连接。
   * 密码只在这次调用中使用，不回传 renderer。
   */
  async update(id: string, input: MediaSourceInput): Promise<MediaSourceSummary> {
    const current = await this.require(id)
    const name = input.name.trim()
    const sameTarget =
      current.kind === input.kind &&
      current.url === input.url.trim() &&
      current.username === input.username.trim()
    if (sameTarget && !input.password) {
      if (!name) throw new MediaSourceError('invalid_input', '请填写名称')
      const record = { ...current, name }
      await this.store.save(record)
      return toSummary(record)
    }
    if (!input.password)
      throw new MediaSourceError('invalid_input', '修改地址或账号后需要重新输入密码')
    const record = await this.connect(input, { id, createdAt: current.createdAt })
    await this.store.save(record)
    this.invalidate(id)
    return toSummary(record)
  }

  async relogin(id: string, password: string): Promise<MediaSourceSummary> {
    const current = await this.require(id)
    const record = await this.connect(
      {
        kind: current.kind,
        name: current.name,
        url: current.url,
        username: current.username,
        password,
      },
      { id, createdAt: current.createdAt },
    )
    await this.store.save(record)
    this.invalidate(id)
    return toSummary(record)
  }

  async remove(id: string) {
    await this.store.remove(id)
    this.invalidate(id)
  }

  /** 重置应用：先撤销租约与缓存，再删除配置文件；删除失败向上抛出 */
  async clear() {
    this.invalidate()
    await this.store.clear()
  }

  /**
   * 以来源的 provider 执行一次操作；401 时标记需要重新登录。
   * 所有异常都映射为带稳定错误码的 MediaSourceError。
   */
  async use<T>(id: string, action: (provider: MediaSourceProvider) => Promise<T>): Promise<T> {
    const source = await this.require(id)
    if (source.needsLogin) throw new MediaSourceError('auth_failed', '登录已失效，请重新登录')
    let provider = this.providers.get(id)
    if (!provider) {
      provider = this.factories[source.kind].create(source, await this.store.deviceId())
      this.providers.set(id, provider)
    }
    try {
      return await action(provider)
    } catch (error) {
      const mapped = toMediaSourceError(error)
      // 只处理当前凭证发出的请求：重新登录或修改后旧 provider 已被替换，
      // 它晚到的 401 不能把刚修好的来源再标记为失效、撤销新租约
      if (mapped.code === 'auth_failed' && this.providers.get(id) === provider) {
        await this.store.setNeedsLogin(id, true)
        this.invalidate(id)
      }
      throw mapped
    }
  }

  async kindOf(id: string) {
    return (await this.require(id)).kind
  }

  private async require(id: string): Promise<MediaSourceRecord> {
    const source = await this.store.get(id)
    if (!source) throw new MediaSourceError('source_removed')
    return source
  }

  private async connect(
    input: MediaSourceInput,
    meta: Pick<MediaSourceRecord, 'id' | 'createdAt'>,
  ): Promise<MediaSourceRecord> {
    if (!(MEDIA_SOURCE_KINDS as readonly string[]).includes(input.kind))
      throw new MediaSourceError('invalid_input', '不支持的媒体源类型')
    const name = input.name.trim()
    if (!name) throw new MediaSourceError('invalid_input', '请填写名称')
    try {
      const { url, credential } = await this.factories[input.kind].connect(
        { url: input.url, username: input.username.trim(), password: input.password },
        await this.store.deviceId(),
      )
      return {
        ...meta,
        kind: input.kind,
        name: name.slice(0, 100),
        url,
        username: input.username.trim(),
        needsLogin: false,
        credential,
      }
    } catch (error) {
      throw toMediaSourceError(error)
    }
  }
}
