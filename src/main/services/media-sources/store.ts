import type { MediaSourceKind, MediaSourceSummary } from '@marchen/shared/media-sources'
import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { MEDIA_SOURCE_KINDS } from '@marchen/shared/media-sources'
import { z } from 'zod'

/**
 * 媒体源配置与凭证。
 *
 * 产品决定凭证直接保存，不使用 safeStorage / 系统密钥环：各平台行为一致，
 * 也不会因钥匙串变化导致凭证解不开。凭证只在主进程读取，不经 IPC 返回 renderer。
 */
const credential = z.discriminatedUnion('type', [
  z.object({ type: z.literal('basic'), password: z.string() }),
  z.object({
    type: z.literal('token'),
    token: z.string().min(1),
    userId: z.string().min(1),
    serverId: z.string(),
  }),
])
const record = z.object({
  id: z.string().uuid(),
  kind: z.enum(MEDIA_SOURCE_KINDS),
  name: z.string().min(1).max(100),
  url: z.string().url(),
  username: z.string().max(256),
  needsLogin: z.boolean(),
  createdAt: z.string(),
  credential,
})
const schema = z.object({
  version: z.literal(1),
  /** Jellyfin / Emby 要求客户端带稳定的设备 id，每次安装生成一次，重置后重新生成 */
  deviceId: z.string().min(1),
  sources: z.array(record).max(50),
})

export type MediaSourceCredential = z.infer<typeof credential>
export type MediaSourceRecord = z.infer<typeof record>
type StoreData = z.infer<typeof schema>

export const MEDIA_SOURCES_FILE = 'media-sources.json'

export const toSummary = (source: MediaSourceRecord): MediaSourceSummary => ({
  id: source.id,
  kind: source.kind as MediaSourceKind,
  name: source.name,
  url: source.url,
  username: source.username,
  needsLogin: source.needsLogin,
  createdAt: source.createdAt,
})

export class MediaSourceStore {
  private data: Promise<StoreData> | undefined
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly file: string) {}

  private get temporary() {
    return `${this.file}.tmp`
  }

  private load(): Promise<StoreData> {
    this.data ??= (async () => {
      let raw: string
      try {
        raw = await readFile(this.file, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return this.empty()
        throw error
      }
      try {
        return schema.parse(JSON.parse(raw))
      } catch {
        // 文件损坏时降级为空列表，但先留存原文件，避免用户的配置被静默覆盖掉
        await rename(this.file, join(dirname(this.file), 'media-sources.corrupt.json')).catch(
          () => {},
        )
        return this.empty()
      }
    })()
    return this.data
  }

  private empty(): StoreData {
    return { version: 1, deviceId: randomUUID(), sources: [] }
  }

  /** 串行写入：先写临时文件再 rename，避免进程中断时写出半个 JSON。 */
  private async mutate<T>(change: (data: StoreData) => T): Promise<T> {
    const work = this.tail.then(async () => {
      const data = await this.load()
      const next = structuredClone(data)
      const result = change(next)
      schema.parse(next)
      await writeFile(this.temporary, JSON.stringify(next, null, 2), { mode: 0o600 })
      await rename(this.temporary, this.file)
      this.data = Promise.resolve(next)
      return result
    })
    this.tail = work.then(
      () => {},
      () => {},
    )
    return work
  }

  async deviceId() {
    return (await this.load()).deviceId
  }

  async list(): Promise<MediaSourceRecord[]> {
    return (await this.load()).sources
  }

  async get(id: string): Promise<MediaSourceRecord | undefined> {
    return (await this.load()).sources.find((source) => source.id === id)
  }

  async save(source: MediaSourceRecord) {
    await this.mutate((data) => {
      const index = data.sources.findIndex((item) => item.id === source.id)
      if (index >= 0) data.sources[index] = source
      else data.sources.push(source)
    })
  }

  async setNeedsLogin(id: string, needsLogin: boolean) {
    await this.mutate((data) => {
      const source = data.sources.find((item) => item.id === id)
      if (source) source.needsLogin = needsLogin
    })
  }

  async remove(id: string) {
    await this.mutate((data) => {
      data.sources = data.sources.filter((source) => source.id !== id)
    })
  }

  /** 重置应用：删除配置文件与残留临时文件；删除失败必须抛出，让重置整体失败。 */
  async clear() {
    const work = this.tail.then(async () => {
      await rm(this.file, { force: true })
      await rm(this.temporary, { force: true })
      this.data = undefined
    })
    this.tail = work.then(
      () => {},
      () => {},
    )
    return work
  }
}
