import type { EngineStats, PreparedTorrent } from './engine-port'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import bencode from 'bencode'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DownloadRepository } from './repository'
import { DownloadService } from './service'
const mock = vi.hoisted(() => ({
  directory: '',
  stats: undefined as ((s: EngineStats) => void) | undefined,
  start: vi.fn(),
  stop: vi.fn(),
  shutdown: vi.fn(async () => {}),
  prepare: vi.fn(),
}))
vi.mock('electron', () => ({
  app: { getPath: () => mock.directory },
  BrowserWindow: { getAllWindows: () => [] },
  powerMonitor: { on: vi.fn() },
}))
vi.mock('./engine', () => ({
  ProcessDownloadEngine: class {
    constructor(callback: (s: EngineStats) => void) {
      mock.stats = callback
    }
    prepare = mock.prepare
    start = mock.start
    stop = mock.stop
    shutdown = mock.shutdown
    limit = vi.fn()
  },
}))
let service: DownloadService | undefined
const directories: string[] = []
afterEach(async () => {
  await service?.shutdown()
  service = undefined
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
  vi.clearAllMocks()
})
async function setup() {
  mock.directory = await mkdtemp(join(tmpdir(), 'marchen-service-'))
  directories.push(mock.directory)
  service = new DownloadService()
  await service.list()
  const id = randomUUID()
  const content = Buffer.from('verified media')
  const info = {
    name: 'sample.mkv',
    length: content.length,
    'piece length': 16384,
    pieces: createHash('sha1').update(content).digest(),
  }
  const metadata = bencode.encode({ info })
  const prepared: PreparedTorrent = {
    draft: {
      id,
      infoHash: createHash('sha1').update(bencode.encode(info)).digest('hex'),
      name: 'sample',
      files: [{ index: 0, path: 'sample.mkv', size: content.length }],
    },
    metadata,
  }
  mock.prepare.mockResolvedValue(prepared)
  await service.prepare(id, {
    kind: 'magnet',
    value: `magnet:?xt=urn:btih:${prepared.draft.infoHash}`,
  })
  await service.confirm(id, [0], mock.directory)
  await vi.waitFor(() => expect(mock.start).toHaveBeenCalled())
  const task = (await service.list()).tasks[0]
  return { id, content, task }
}
describe('下载服务生命周期', () => {
  it('确认才启动、完成才可播放、暂停等待引擎停止且删除保留文件', async () => {
    const { id, content, task } = await setup()
    await expect(service!.filePath(id, 0)).rejects.toThrow('尚未完整')
    await writeFile(join(task.directory, 'sample.mkv'), content)
    mock.stats!({
      id,
      files: [{ index: 0, verifiedBytes: content.length, complete: true }],
      uploaded: 0,
      downloadSpeed: 0,
      uploadSpeed: 0,
      peers: 1,
    })
    expect(await service!.filePath(id, 0)).toContain('sample.mkv')
    expect((await service!.list()).tasks[0].state).toBe('seeding')
    await service!.pause(id)
    expect(mock.stop).toHaveBeenCalledWith(id)
    await service!.remove(id, false, () => false)
    expect(await readFile(join(task.directory, 'sample.mkv'))).toEqual(content)
    expect((await service!.list()).tasks).toHaveLength(0)
  })
  it('暂停任务重启离线校验，不启动下载；占用文件不删除', async () => {
    const { id, content, task } = await setup()
    await writeFile(join(task.directory, 'sample.mkv'), content)
    await service!.pause(id)
    await service!.shutdown()
    mock.start.mockClear()
    service = new DownloadService()
    await vi.waitFor(async () => expect((await service!.list()).tasks[0].state).toBe('completed'))
    expect(mock.start).not.toHaveBeenCalled()
    await expect(service.remove(id, true, () => true)).rejects.toThrow('正在播放')
    expect(await readFile(join(task.directory, 'sample.mkv'))).toEqual(content)
  })
  it('达到分享率自动停止并保存基准', async () => {
    const { id, content } = await setup()
    mock.stats!({
      id,
      files: [{ index: 0, verifiedBytes: content.length, complete: true }],
      uploaded: content.length,
      downloadSpeed: 0,
      uploadSpeed: 0,
      peers: 1,
    })
    await vi.waitFor(async () => expect((await service!.list()).tasks[0].intent).toBe('stopped'))
    expect((await service!.list()).tasks[0].ratioBaseBytes).toBe(content.length)
    expect(mock.stop).toHaveBeenCalledWith(id)
  })
})

describe('下载清理边界', () => {
  it('清除任务前停止引擎，保留下载视频', async () => {
    const { content, task } = await setup()
    await writeFile(join(task.directory, 'sample.mkv'), content)
    await service!.shutdown(true)
    expect(mock.shutdown).toHaveBeenCalled()
    expect(await readFile(join(task.directory, 'sample.mkv'))).toEqual(content)
    const saved = JSON.parse(await readFile(join(mock.directory, 'downloads', 'tasks.json'), 'utf8'))
    expect(saved.tasks).toEqual([])
  })
  it('确认完成后的草稿清理不能停止正式任务', async () => {
    const { id } = await setup()
    mock.stop.mockClear()
    await service!.cancel(id)
    expect(mock.stop).not.toHaveBeenCalled()
  })
})


describe('下载进程失败', () => {
  it('启动错误在任务中呈现，保留重试能力', async () => {
    const { id } = await setup()
    await service!.pause(id)
    mock.start.mockRejectedValueOnce(new Error('模拟进程异常'))
    await expect(service!.resume(id)).rejects.toThrow('模拟进程异常')
    expect((await service!.list()).tasks[0].state).toBe('error')
    await service!.resume(id)
    expect((await service!.list()).tasks[0].state).toBe('checking')
  })
})


it('保存失败停止引擎并向用户报告错误', async () => {
  const { id } = await setup()
  vi.spyOn(DownloadRepository.prototype, 'save').mockRejectedValueOnce(new Error('ENOSPC'))
  await expect(service!.pause(id)).rejects.toThrow('保存失败')
  expect(mock.shutdown).toHaveBeenCalled()
  expect((await service!.list()).error).toContain('已停止传输')
  vi.restoreAllMocks()
})
