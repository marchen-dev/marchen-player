import type { DownloadSettings, DownloadTask } from '@marchen/shared/downloads'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DOWNLOAD_LIMITS } from '@marchen/shared/downloads'
import { z } from 'zod'
import { validateTorrentPath } from './paths'
const number = z.number().finite().nonnegative()
const file = z.object({
  index: number.int(),
  path: z.string().refine((value) => {
    try {
      validateTorrentPath(value)
      return true
    } catch {
      return false
    }
  }),
  size: number.int(),
  selected: z.boolean(),
  verifiedBytes: number.int(),
  complete: z.boolean(),
})
// 读取旧版记录时兼容容量字段，并剥离已废弃的做种配置与统计。
const task = z.preprocess(
  (value) => {
    if (!value || typeof value !== 'object') return value
    const record = value as Record<string, unknown>
    return { ...record, selectedBytes: record.selectedBytes ?? record.ratioBaseBytes }
  },
  z
    .object({
      id: z.string().uuid(),
      infoHash: z
        .string()
        .regex(/^[a-f0-9]{40}$/)
        .optional(),
      http: z
        .object({
          url: z.string().url(),
          urlChain: z.array(z.string().url()),
          partialName: z.string().refine((value) => !value.includes('/') && !value.includes('\\')),
          offset: number,
          etag: z.string(),
          lastModified: z.string(),
        })
        .optional(),
      name: z.string().max(1024),
      directory: z.string().min(1),
      files: z.array(file).max(DOWNLOAD_LIMITS.files),
      intent: z.enum(['running', 'paused', 'stopped']),
      state: z
        .enum([
          'checking',
          'waiting',
          'downloading',
          'pausing',
          'paused',
          'seeding',
          'completed',
          'error',
        ])
        .transform((state) => (state === 'seeding' ? ('completed' as const) : state)),
      createdAt: number,
      updatedAt: number,
      completedAt: number.optional(),
      selectedBytes: number,
      error: z.string().optional(),
      downloadSpeed: number,
      peers: number.int(),
    })
    .refine((value) => Boolean(value.http) !== Boolean(value.infoHash), '下载任务来源无效'),
)
export const settingsSchema = z.object({
  directory: z.string(),
  uploadLimit: z
    .number()
    .int()
    .refine((n) => n === -1 || n > 0),
})
const schema = z.object({
  schemaVersion: z.literal(1),
  settings: settingsSchema,
  tasks: z.array(task).max(DOWNLOAD_LIMITS.tasks),
})
export interface DownloadData {
  schemaVersion: 1
  settings: DownloadSettings
  tasks: DownloadTask[]
}
export class DownloadRepository {
  private tail: Promise<void> = Promise.resolve()
  constructor(readonly directory: string) {}
  async load(defaultDirectory: string): Promise<DownloadData> {
    await mkdir(this.directory, { recursive: true })
    let missing = false
    try {
      return schema.parse(JSON.parse(await readFile(join(this.directory, 'tasks.json'), 'utf8')))
    } catch (error) {
      missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
    }
    try {
      return schema.parse(
        JSON.parse(await readFile(join(this.directory, 'tasks.backup.json'), 'utf8')),
      )
    } catch (error) {
      if (missing && (error as NodeJS.ErrnoException).code === 'ENOENT')
        return {
          schemaVersion: 1,
          settings: { directory: defaultDirectory, uploadLimit: -1 },
          tasks: [],
        }
      throw new Error('下载记录损坏或版本不兼容，已保留原文件，请恢复备份')
    }
  }
  save(data: DownloadData) {
    const content = JSON.stringify(schema.parse(data))
    const work = this.tail.then(async () => {
      await mkdir(this.directory, { recursive: true })
      const target = join(this.directory, 'tasks.json')
      try {
        const previous = await readFile(target, 'utf8')
        schema.parse(JSON.parse(previous))
        await writeFile(join(this.directory, 'tasks.backup.tmp'), previous, { mode: 0o600 })
        await rename(
          join(this.directory, 'tasks.backup.tmp'),
          join(this.directory, 'tasks.backup.json'),
        )
      } catch (error) {
        // 损坏内容不得覆盖可恢复的上一版；其他写盘错误则向上传递。
        if (
          !(error instanceof z.ZodError) &&
          !(error instanceof SyntaxError) &&
          (error as NodeJS.ErrnoException).code !== 'ENOENT'
        )
          throw error
      }
      await writeFile(join(this.directory, 'tasks.tmp'), content, { mode: 0o600 })
      await rename(join(this.directory, 'tasks.tmp'), target)
    })
    this.tail = work.catch(() => {})
    return work
  }
}
