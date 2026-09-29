import type {
  DownloadDraft,
  DownloadInput,
  DownloadSettings,
  DownloadSnapshot,
  DownloadTask,
} from '@marchen/shared/downloads'
import type { EngineStats, PreparedTorrent } from './engine-port'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { DOWNLOAD_LIMITS } from '@marchen/shared/downloads'
import { app, BrowserWindow } from 'electron'
import parseTorrent from 'parse-torrent'
import { setDownloadAvailability } from './availability'
import { ProcessDownloadEngine } from './engine'
import { HttpDownloadEngine } from './http-engine'
import { validateMagnet, validateMetadata } from './metadata'
import {
  removeEmptyTaskDirectories,
  reserveTorrentPaths,
  safeTaskPath,
  validateTorrentPath,
} from './paths'
import { DownloadRepository, settingsSchema } from './repository'
import { verifyFiles } from './verify-files'

export class DownloadService {
  private repository = new DownloadRepository(join(app.getPath('userData'), 'downloads'))
  private settings: DownloadSettings = {
    directory: app.getPath('downloads'),
    uploadLimit: -1,
  }
  private tasks: DownloadTask[] = []
  private drafts = new Map<string, PreparedTorrent>()
  private preparing = new Set<string>()
  private cancelled = new Set<string>()
  private locks = new Map<string, Promise<unknown>>()
  private ready: Promise<void>
  private revision = 0
  private error?: string
  private storageLoaded = false
  private closing = false
  private timer: ReturnType<typeof setInterval>
  private engine = new ProcessDownloadEngine(
    (s) => this.stats(s),
    () => this.crashed(),
  )
  private httpEngine = new HttpDownloadEngine(
    () => this.tasks,
    (completed) => {
      this.publish()
      if (completed && !this.closing) void this.persist().catch(() => {})
    },
  )
  constructor() {
    this.ready = this.restore()
    setDownloadAvailability((path) => this.available(path))
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
        task.peers = 0
        if (task.http) {
          if (!task.files[0].complete) {
            task.state = 'paused'
            task.intent = 'paused'
          }
          continue
        }
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
          if (task.http) {
            if (task.files[0].complete) {
              const info = await stat(await safeTaskPath(task.directory, task.files[0].path))
              if (!info.isFile() || info.size !== task.files[0].size) {
                task.files[0].complete = false
                throw new Error('已下载文件被移动或修改')
              }
            }
            this.publish()
            return
          }
          const metadata = await this.metadata(task.id)
          const verified = await verifyFiles(metadata, task.directory)
          for (const file of task.files) Object.assign(file, verified[file.index])
          const complete = this.complete(task)
          if (!complete) task.completedAt = undefined
          task.state = complete ? 'completed' : 'paused'
          // 旧版做种任务也只做离线校验，完成后不再连接下载网络。
          if (complete) {
            task.intent = 'stopped'
            task.completedAt ??= Date.now()
            await this.persist()
          }
          if (!complete && task.intent === 'running') await this.start(task)
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
      void this.httpEngine.shutdown()
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
  async addHttp(urlValue: string, directory: string) {
    await this.ensure()
    return this.serial('confirm', async () => {
      const url = new URL(urlValue.trim())
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.href.length > 16384
      )
        throw new Error('请输入 HTTP/HTTPS 文件直链')
      if (this.tasks.length >= DOWNLOAD_LIMITS.tasks) throw new Error('下载任务超过限制')
      if (this.tasks.some((task) => task.http?.url === url.href))
        throw new Error('该链接的下载任务已存在')
      const id = randomUUID()
      let name = decodeURIComponent(url.pathname.split('/').pop() || `下载-${id}`)
      if (name.length > 180) name = `下载-${id}`
      validateTorrentPath(name)
      if (name.includes('/')) throw new Error('下载文件名无效')
      const root = await realpath(directory)
      const partialName = `.marchen-${id}.part`
      await reserveTorrentPaths(root, [{ path: name }, { path: partialName }])
      const now = Date.now()
      const task: DownloadTask = {
        id,
        name,
        directory: root,
        http: {
          url: url.href,
          urlChain: [url.href],
          partialName,
          offset: 0,
          etag: '',
          lastModified: '',
        },
        files: [
          { index: 0, path: name, size: 0, selected: true, verifiedBytes: 0, complete: false },
        ],
        intent: 'running',
        state: 'waiting',
        createdAt: now,
        updatedAt: now,
        selectedBytes: 0,
        downloadSpeed: 0,
        peers: 0,
      }
      this.tasks.push(task)
      await this.persist()
      this.httpEngine.start(task)
      return id
    })
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
      const duplicate = this.tasks.find((task) => task.infoHash === identity.infoHash)
      if (duplicate)
        return {
          id,
          infoHash: duplicate.infoHash!,
          name: duplicate.name,
          files: duplicate.files.map(({ index, path, size }) => ({ index, path, size })),
          existingTaskId: duplicate.id,
        }
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
      const taskDirectory = await realpath(directory)
      await mkdir(join(this.repository.directory, 'metadata'), { recursive: true })
      await writeFile(
        join(this.repository.directory, 'metadata', `${id}.torrent`),
        prepared.metadata,
        { mode: 0o600 },
      )
      await reserveTorrentPaths(taskDirectory, prepared.draft.files)
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
        createdAt: now,
        updatedAt: now,
        selectedBytes: files.filter((f) => f.selected).reduce((n, f) => n + f.size, 0),
        downloadSpeed: 0,
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
    task.receivedBytes = 0
    task.hashFailures = 0
    task.error = undefined
    this.publish()
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
      if (!task.files.some((file) => file.selected)) throw new Error('请先选择要下载的文件')
      if (this.complete(task)) return
      task.intent = 'running'
      await this.persist()
      if (task.http) {
        this.httpEngine.start(task)
        return
      }
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
      if (task.http) {
        this.httpEngine.pause(task)
        await this.persist()
        return
      }
      if (completed && !this.complete(task)) return
      task.intent = completed ? 'stopped' : 'paused'
      task.state = 'pausing'
      this.publish()
      await this.engine.stop(id)
      task.state = this.complete(task) ? 'completed' : 'paused'
      task.downloadSpeed = 0
      task.peers = 0
      await this.persist()
      this.publish()
    })
  }
  async selectFiles(id: string, indices: number[]) {
    await this.ensure()
    return this.serial(id, async () => {
      const task = this.get(id)
      if (
        !Array.isArray(indices) ||
        indices.length > task.files.length ||
        indices.some((index) => !Number.isInteger(index) || !task.files[index]) ||
        new Set(indices).size !== indices.length
      )
        throw new Error('请选择有效文件')
      if (task.files.every((file) => file.selected === indices.includes(file.index))) return
      const shouldRun = task.intent === 'running' || task.state === 'completed'
      task.state = 'pausing'
      this.publish()
      try {
        // 先关闭原传输再按新清单重新校验和选片，防止已取消的文件继续被旧选择下载。
        await this.engine.stop(id)
        for (const file of task.files) file.selected = indices.includes(file.index)
        task.selectedBytes = task.files
          .filter((file) => file.selected)
          .reduce((sum, file) => sum + file.size, 0)
        const complete = this.complete(task)
        task.completedAt = complete ? (task.completedAt ?? Date.now()) : undefined
        task.intent = complete ? 'stopped' : shouldRun && indices.length > 0 ? 'running' : 'paused'
        task.state = complete ? 'completed' : 'paused'
        task.downloadSpeed = 0
        task.peers = 0
        task.error = undefined
        task.updatedAt = Date.now()
        await this.persist()
        this.publish()
        if (task.intent === 'running') await this.start(task)
      } catch (error) {
        this.fail(task, error)
        throw error
      }
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
    task.receivedBytes = s.receivedBytes ?? 0
    task.hashFailures = s.hashFailures ?? 0
    task.downloadSpeed = s.downloadSpeed
    task.peers = s.peers
    task.updatedAt = Date.now()
    if (this.complete(task)) {
      task.completedAt ??= Date.now()
      task.state = 'pausing'
      void this.pause(task.id, true).catch((error) => this.fail(task, error))
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
    task.peers = 0
    this.publish()
  }
  private crashed() {
    if (this.closing) return
    for (const t of this.tasks)
      if (!t.http && t.intent === 'running') this.fail(t, new Error('下载进程已退出，请重试'))
  }
  async setSettings(value: DownloadSettings) {
    await this.ensure()
    this.settings = settingsSchema.parse(value)
    await this.engine.limit(this.settings.uploadLimit)
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
      if (task.http) this.httpEngine.forget(task)
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
        if (task.http) paths.push(await safeTaskPath(task.directory, task.http.partialName))
        for (const path of paths)
          await unlink(path).catch((error) => {
            if (error.code !== 'ENOENT') throw error
          })
        await removeEmptyTaskDirectories(task.directory, task.files)
      }
      this.tasks = this.tasks.filter((t) => t.id !== id)
      await this.persist()
      this.publish()
    })
  }
  async peers(id: string) {
    await this.ensure()
    const task = this.get(id)
    if (task.http) return []
    if (task.intent !== 'running' || !['waiting', 'downloading'].includes(task.state)) return []
    return this.engine.peers(id)
  }
  async directory(id: string) {
    await this.ensure()
    const task = this.get(id)
    const root = task.files[0]?.path.split('/')[0]
    if (root && task.files.every((file) => file.path.startsWith(`${root}/`)))
      return safeTaskPath(task.directory, root)
    return task.directory
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
    await this.httpEngine.shutdown()
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
