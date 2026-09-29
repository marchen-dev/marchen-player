import type {
  DownloadDraft,
  DownloadInput,
  DownloadSettings,
  DownloadSnapshot,
  DownloadTask,
} from '@marchen/shared/downloads'
import type { EngineStats, PreparedTorrent } from './engine-port'
import { mkdir, readFile, realpath, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { DOWNLOAD_LIMITS, seedingDelta, shouldStopSeeding } from '@marchen/shared/downloads'
import { app, BrowserWindow, powerMonitor } from 'electron'
import parseTorrent from 'parse-torrent'
import { setDownloadAvailability } from './availability'
import { ProcessDownloadEngine } from './engine'
import { validateMagnet, validateMetadata } from './metadata'
import { safeTaskPath } from './paths'
import { DownloadRepository, settingsSchema } from './repository'
import { verifyFiles } from './verify-files'

export class DownloadService {
  private repository = new DownloadRepository(join(app.getPath('userData'), 'downloads'))
  private settings: DownloadSettings = {
    directory: app.getPath('downloads'),
    uploadLimit: -1,
    policy: 'ratio-or-time',
  }
  private tasks: DownloadTask[] = []
  private drafts = new Map<string, PreparedTorrent>()
  private preparing = new Set<string>()
  private cancelled = new Set<string>()
  private locks = new Map<string, Promise<unknown>>()
  private uploaded = new Map<string, number>()
  private ticks = new Map<string, number>()
  private ready: Promise<void>
  private revision = 0
  private error?: string
  private storageLoaded = false
  private suspended = false
  private closing = false
  private timer: ReturnType<typeof setInterval>
  private engine = new ProcessDownloadEngine(
    (s) => this.stats(s),
    () => this.crashed(),
  )
  constructor() {
    this.ready = this.restore()
    setDownloadAvailability(path => this.available(path))
    powerMonitor.on('suspend', () => {
      this.suspended = true
      this.ticks.clear()
    })
    powerMonitor.on('resume', () => {
      this.suspended = false
      this.ticks.clear()
    })
    this.timer = setInterval(() => {
      void this.ready
        .then(() => {
          if (!this.error && !this.closing) return this.persist()
          return undefined
        })
        .catch(() => {})
    }, DOWNLOAD_LIMITS.checkpointMs)
  }
  private async restore() {
    try {
      const data = await this.repository.load(app.getPath('downloads'))
      this.storageLoaded = true
      this.settings = data.settings
      this.tasks = data.tasks
      for (const task of this.tasks) {
        task.downloadSpeed = 0
        task.uploadSpeed = 0
        task.peers = 0
        task.files.forEach((f) => {
          f.complete = false
          f.verifiedBytes = 0
        })
        task.state = 'checking'
      }
      this.publish()
      // 后台逐项校验，list 无需等待大文件扫描。
      void this.recoverTasks()
    } catch (error) {
      this.error = message(error)
      this.publish()
    }
  }
  private async recoverTasks() {
    for (const task of this.tasks) {
      if (this.closing) return
      await this.serial(task.id, async () => {
        try {
          const metadata = await this.metadata(task.id)
          const verified = await verifyFiles(metadata, task.directory)
          for (const file of task.files) Object.assign(file, verified[file.index])
          const complete = this.complete(task)
          if (!complete) task.completedAt = undefined
          task.state = complete ? 'completed' : 'paused'
          if (task.intent === 'running') await this.start(task)
          else this.publish()
        } catch (error) {
          this.fail(task, error)
        }
      })
    }
  }
  private async serial<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const next = (this.locks.get(id) ?? Promise.resolve()).catch(() => {}).then(operation)
    this.locks.set(id, next)
    try {
      return await next
    } finally {
      if (this.locks.get(id) === next) this.locks.delete(id)
    }
  }
  private async ensure() {
    await this.ready
    if (this.error) throw new Error(this.error)
    if (this.closing) throw new Error('下载服务正在停止')
  }
  private get(id: string) {
    const t = this.tasks.find((t) => t.id === id)
    if (!t) throw new Error('下载任务不存在')
    return t
  }
  private metadata(id: string) {
    return readFile(join(this.repository.directory, 'metadata', `${id}.torrent`))
  }
  private complete(t: DownloadTask) {
    const selected = t.files.filter((f) => f.selected)
    return selected.length > 0 && selected.every((f) => f.complete)
  }
  private async persist() {
    try {
      await this.repository.save({ schemaVersion: 1, settings: this.settings, tasks: this.tasks })
      this.error = undefined
    } catch {
      this.error = '下载记录保存失败，已停止传输，请检查磁盘后重启应用'
      if (!this.closing) void this.engine.shutdown().catch(() => {})
      this.publish()
      throw new Error(this.error)
    }
  }
  private publish() {
    const snapshot = this.snapshot()
    for (const window of BrowserWindow.getAllWindows())
      if (!window.isDestroyed()) window.webContents.send('downloadsChanged', snapshot)
  }
  private snapshot(): DownloadSnapshot {
    return {
      revision: ++this.revision,
      tasks: structuredClone(this.tasks),
      settings: { ...this.settings },
      error: this.error,
    }
  }
  async list() {
    await this.ready
    return this.snapshot()
  }
  async prepare(id: string, input: DownloadInput): Promise<DownloadDraft> {
    await this.ensure()
    if (
      this.tasks.length >= DOWNLOAD_LIMITS.tasks ||
      this.drafts.size + this.preparing.size >= DOWNLOAD_LIMITS.drafts
    )
      throw new Error('下载任务或待确认任务超过限制')
    if (!/^[a-f0-9-]{36}$/i.test(id) || this.preparing.has(id) || this.drafts.has(id))
      throw new Error('无效或重复的请求')
    this.preparing.add(id)
    try {
      let value: string | Uint8Array
      if (input.kind === 'magnet') value = validateMagnet(input.value.trim())
      else {
        const info = await stat(input.path)
        if (!info.isFile() || info.size > DOWNLOAD_LIMITS.torrentBytes)
          throw new Error('种子文件无效或超过 8 MiB')
        value = await readFile(input.path)
        validateMetadata(value)
      }
      const identity = await parseTorrent(value)
      const duplicate = this.tasks.find(task => task.infoHash === identity.infoHash)
      if (duplicate) return { id, infoHash: duplicate.infoHash, name: duplicate.name, files: duplicate.files.map(({ index, path, size }) => ({ index, path, size })), existingTaskId: duplicate.id }
      const result = await this.engine.prepare(id, value)
      if (this.cancelled.has(id) || this.closing) throw new Error('已取消添加')
      const existing = this.tasks.find((t) => t.infoHash === result.draft.infoHash)
      if (existing) return { ...result.draft, existingTaskId: existing.id }
      if ([...this.drafts.values()].some((d) => d.draft.infoHash === result.draft.infoHash))
        throw new Error('该种子已在待确认列表中')
      this.drafts.set(id, result)
      return result.draft
    } finally {
      this.preparing.delete(id)
      this.cancelled.delete(id)
    }
  }
  async cancel(id: string) {
    if (this.tasks.some((task) => task.id === id)) return
    if (this.preparing.has(id)) this.cancelled.add(id)
    this.drafts.delete(id)
    await this.engine.stop(id)
  }
  async confirm(id: string, indices: number[], directory: string) {
    await this.ensure()
    return this.serial('confirm', async () => {
      const prepared = this.drafts.get(id)
      if (!prepared) throw new Error('待确认任务已过期')
      if (this.tasks.some((t) => t.infoHash === prepared.draft.infoHash))
        throw new Error('该下载任务已存在')
      if (!indices.length || indices.some((i) => !Number.isInteger(i) || !prepared.draft.files[i]))
        throw new Error('请选择有效文件')
      if (this.tasks.length >= DOWNLOAD_LIMITS.tasks) throw new Error('下载任务超过限制')
      const parent = await realpath(directory)
      const taskDirectory = join(parent, `Marchen-${id}`)
      await mkdir(taskDirectory)
      for (const f of prepared.draft.files) await safeTaskPath(taskDirectory, f.path)
      await mkdir(join(this.repository.directory, 'metadata'), { recursive: true })
      await writeFile(
        join(this.repository.directory, 'metadata', `${id}.torrent`),
        prepared.metadata,
        { mode: 0o600 },
      )
      const now = Date.now()
      const files = prepared.draft.files.map((f) => ({
        ...f,
        selected: indices.includes(f.index),
        verifiedBytes: 0,
        complete: false,
      }))
      const task: DownloadTask = {
        id,
        infoHash: prepared.draft.infoHash,
        name: prepared.draft.name,
        directory: taskDirectory,
        files,
        intent: 'running',
        state: 'checking',
        policy: this.settings.policy,
        createdAt: now,
        updatedAt: now,
        uploadedBytes: 0,
        ratioBaseBytes: files.filter((f) => f.selected).reduce((n, f) => n + f.size, 0),
        seedingMs: 0,
        downloadSpeed: 0,
        uploadSpeed: 0,
        peers: 0,
      }
      this.tasks.push(task)
      this.drafts.delete(id)
      await this.persist()
      this.publish()
      void this.resume(id).catch((error) => this.fail(task, error))
      return id
    })
  }
  private async start(task: DownloadTask) {
    if (this.closing) return
    task.state = 'checking'
    task.error = undefined
    this.publish()
    this.uploaded.set(task.id, 0)
    this.ticks.delete(task.id)
    await this.engine.limit(this.settings.uploadLimit)
    await this.engine.start(
      task.id,
      await this.metadata(task.id),
      task.directory,
      task.files.filter((f) => f.selected).map((f) => f.index),
    )
  }
  async resume(id: string) {
    await this.ensure()
    return this.serial(id, async () => {
      const task = this.get(id)
      task.intent = 'running'
      await this.persist()
      try {
        await this.start(task)
      } catch (error) {
        this.fail(task, error)
        throw error
      }
    })
  }
  async pause(id: string, completed = false) {
    await this.ensure()
    return this.serial(id, async () => {
      const task = this.get(id)
      task.intent = completed ? 'stopped' : 'paused'
      task.state = 'pausing'
      this.publish()
      await this.engine.stop(id)
      task.state = this.complete(task) ? 'completed' : 'paused'
      task.downloadSpeed = 0
      task.uploadSpeed = 0
      task.peers = 0
      this.ticks.delete(id)
      await this.persist()
      this.publish()
    })
  }
  private stats(s: EngineStats) {
    const task = this.tasks.find((t) => t.id === s.id)
    if (!task || task.state === 'pausing' || task.intent !== 'running') return
    if (s.error) {
      this.fail(task, new Error(s.error))
      return
    }
    for (const f of s.files) if (task.files[f.index]) Object.assign(task.files[f.index], f)
    const last = this.uploaded.get(s.id) ?? 0
    task.uploadedBytes += Math.max(0, s.uploaded - last)
    this.uploaded.set(s.id, s.uploaded)
    task.downloadSpeed = s.downloadSpeed
    task.uploadSpeed = s.uploadSpeed
    task.peers = s.peers
    const now = performance.now()
    task.seedingMs += seedingDelta(
      this.ticks.get(s.id) ?? now,
      now,
      task.state === 'seeding' && !this.suspended,
    )
    this.ticks.set(s.id, now)
    task.updatedAt = Date.now()
    if (this.complete(task)) {
      task.completedAt ??= Date.now()
      task.state = 'seeding'
      if (shouldStopSeeding(task.policy, task.uploadedBytes, task.ratioBaseBytes, task.seedingMs)) {
        task.state = 'pausing'
        void this.pause(task.id, true).catch((error) => this.fail(task, error))
      }
    } else {
      task.completedAt = undefined
      task.state = s.downloadSpeed > 0 ? 'downloading' : 'waiting'
    }
    this.publish()
  }
  private fail(task: DownloadTask, error: unknown) {
    task.state = 'error'
    task.error = message(error)
    task.downloadSpeed = 0
    task.uploadSpeed = 0
    task.peers = 0
    this.publish()
  }
  private crashed() {
    if (this.closing) return
    for (const t of this.tasks)
      if (t.intent === 'running') this.fail(t, new Error('下载进程已退出，请重试'))
  }
  async setSettings(value: DownloadSettings) {
    await this.ensure()
    this.settings = settingsSchema.parse(value)
    await this.engine.limit(this.settings.uploadLimit)
    await this.persist()
    this.publish()
  }
  async setPolicy(id: string, policy: DownloadSettings['policy']) {
    await this.ensure()
    if (!['stop', 'ratio-or-time', 'forever'].includes(policy)) throw new Error('无效做种策略')
    this.get(id).policy = policy
    await this.persist()
    this.publish()
  }
  async filePath(id: string, index: number) {
    await this.ensure()
    const task = this.get(id)
    const file = task.files[index]
    if (!file?.selected || !file.complete || task.state === 'checking')
      throw new Error('文件尚未完整校验')
    const target = await safeTaskPath(task.directory, file.path)
    const info = await stat(target)
    if (!info.isFile() || info.size !== file.size) {
      file.complete = false
      this.publish()
      throw new Error('文件已被移动或修改')
    }
    return target
  }
  async available(path: string) {
    await this.ready
    const target = await realpath(path).catch(() => resolve(path))
    for (const t of this.tasks)
      for (const f of t.files)
        if (resolve(t.directory, f.path) === target) return f.complete && t.state !== 'checking'
    return true
  }
  async remove(id: string, deleteFiles: boolean, isInUse: (path: string) => boolean) {
    await this.ensure()
    await this.pause(id)
    return this.serial(id, async () => {
      const task = this.get(id)
      if (deleteFiles) {
        const paths = await Promise.all(task.files.map((f) => safeTaskPath(task.directory, f.path)))
        if (paths.some(isInUse)) throw new Error('文件正在播放，请先结束播放')
        for (const path of paths) {
          if (
            this.tasks.some(
              (t) => t.id !== id && t.files.some((f) => resolve(t.directory, f.path) === path),
            )
          )
            throw new Error('文件被其他任务使用')
        }
        for (const path of paths)
          await unlink(path).catch((error) => {
            if (error.code !== 'ENOENT') throw error
          })
      }
      this.tasks = this.tasks.filter((t) => t.id !== id)
      await this.persist()
      this.publish()
    })
  }
  async directory(id: string) {
    await this.ensure()
    return this.get(id).directory
  }
  hasActive() {
    return (
      this.tasks.some((t) => t.intent === 'running' && !['error', 'completed'].includes(t.state)) ||
      this.preparing.size > 0
    )
  }
  async shutdown(clear = false) {
    await this.ready
    this.closing = true
    clearInterval(this.timer)
    await this.engine.shutdown()
    await Promise.allSettled([...this.locks.values()])
    if (clear) {
      await rm(join(this.repository.directory, 'metadata'), { recursive: true, force: true })
      this.error = undefined
      this.tasks = []
      this.drafts.clear()
      this.settings = {
        directory: app.getPath('downloads'),
        uploadLimit: -1,
        policy: 'ratio-or-time',
      }
    }
    if (this.storageLoaded || clear) await this.persist()
  }
}
function message(error: unknown) {
  return error instanceof Error ? error.message : '下载操作失败'
}
let service: DownloadService | undefined
export const getDownloads = () => (service ??= new DownloadService())
export const existingDownloads = () => service

export async function clearDownloads() {
  const current = service
  if (current) await current.shutdown(true)
  service = undefined
}
