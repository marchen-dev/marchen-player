import type { EngineStats, PreparedTorrent } from './engine-port'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decodeUserError, encodeUserError, UserError } from '@marchen/shared/errors'
import bencode from 'bencode'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DownloadRepository } from './repository'
import { DownloadService } from './service'

// 这些用例真实读写临时目录，Windows runner 上一次文件操作就可能超过 vi.waitFor 默认的 1 秒，
// 发布构建曾因此偶发失败；放宽等待与单用例超时，只影响慢环境，不改变断言本身。
const WAIT_OPTIONS = { timeout: 5_000 }
vi.setConfig({ testTimeout: 30_000 })
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
async function setup(multi = false) {
  mock.directory = await mkdtemp(join(tmpdir(), 'marchen-service-'))
  directories.push(mock.directory)
  service = new DownloadService()
  await service.list()
  const id = randomUUID()
  const content = Buffer.from('verified media')
  const info = {
    name: 'sample.mkv',
    ...(multi
      ? {
          files: [
            { length: content.length, path: ['01.mkv'] },
            { length: content.length, path: ['02.mkv'] },
          ],
        }
      : { length: content.length }),
    'piece length': 16384,
    pieces: createHash('sha1')
      .update(multi ? Buffer.concat([content, content]) : content)
      .digest(),
  }
  const metadata = bencode.encode({ info })
  const prepared: PreparedTorrent = {
    draft: {
      id,
      infoHash: createHash('sha1').update(bencode.encode(info)).digest('hex'),
      name: 'sample',
      files: multi
        ? [
            { index: 0, path: 'sample.mkv/01.mkv', size: content.length },
            { index: 1, path: 'sample.mkv/02.mkv', size: content.length },
          ]
        : [{ index: 0, path: 'sample.mkv', size: content.length }],
    },
    metadata,
  }
  mock.prepare.mockResolvedValue(prepared)
  await service.prepare(id, {
    kind: 'magnet',
    value: `magnet:?xt=urn:btih:${prepared.draft.infoHash}`,
  })
  await service.confirm(id, [0], mock.directory)
  await vi.waitFor(() => expect(mock.start).toHaveBeenCalled(), WAIT_OPTIONS)
  const task = (await service.list()).tasks[0]
  expect(task.directory).toBe(await realpath(mock.directory))
  return { id, content, task }
}
describe('下载服务生命周期', () => {
  it('确认才启动、完成才可播放、暂停等待引擎停止且删除保留文件', async () => {
    const { id, content, task } = await setup()
    await expect(service!.filePath(id, 0)).rejects.toThrow('尚未下载完成')
    await writeFile(join(task.directory, 'sample.mkv'), content)
    mock.stats!({
      id,
      files: [{ index: 0, verifiedBytes: content.length, complete: true }],
      downloadSpeed: 0,
      peers: 1,
    })
    expect(await service!.filePath(id, 0)).toContain('sample.mkv')
    await vi.waitFor(
      async () => expect((await service!.list()).tasks[0].state).toBe('completed'),
      WAIT_OPTIONS,
    )
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
    await vi.waitFor(
      async () => expect((await service!.list()).tasks[0].state).toBe('completed'),
      WAIT_OPTIONS,
    )
    expect(mock.start).not.toHaveBeenCalled()
    await expect(service.remove(id, true, () => true)).rejects.toThrow('正在播放')
    expect(await readFile(join(task.directory, 'sample.mkv'))).toEqual(content)
  })
  it('上传量为零也在完成后自动停止，不能重新启动已完成任务', async () => {
    const { id, content } = await setup()
    mock.stats!({
      id,
      files: [{ index: 0, verifiedBytes: content.length, complete: true }],
      downloadSpeed: 0,
      peers: 1,
    })
    await vi.waitFor(
      async () => expect((await service!.list()).tasks[0].intent).toBe('stopped'),
      WAIT_OPTIONS,
    )
    await vi.waitFor(
      async () => expect((await service!.list()).tasks[0].state).toBe('completed'),
      WAIT_OPTIONS,
    )
    mock.start.mockClear()
    await service!.resume(id)
    expect(mock.start).not.toHaveBeenCalled()
    expect((await service!.list()).tasks[0].selectedBytes).toBe(content.length)
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
    const saved = JSON.parse(
      await readFile(join(mock.directory, 'downloads', 'tasks.json'), 'utf8'),
    )
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

describe('失败原因带错误码保存', () => {
  it('启动时的用户错误以编码文字写进任务，重启后仍能还原错误码', async () => {
    const { id } = await setup()
    await service!.pause(id)
    mock.start.mockRejectedValueOnce(
      new UserError('downloads.timeout', '获取种子信息或检查已下载文件超时，请重试'),
    )
    await expect(service!.resume(id)).rejects.toMatchObject({ code: 'downloads.timeout' })
    const saved = (await service!.list()).tasks[0].error
    expect(decodeUserError(saved)).toEqual({
      code: 'downloads.timeout',
      message: '获取种子信息或检查已下载文件超时，请重试',
    })
    // 失败原因随任务写进状态文件：重启后读回来的还是带错误码的文字
    await service!.shutdown()
    const stored = JSON.parse(
      await readFile(join(mock.directory, 'downloads', 'tasks.json'), 'utf8'),
    ) as { tasks: Array<{ error?: string }> }
    expect(decodeUserError(stored.tasks[0].error)?.code).toBe('downloads.timeout')
    service = undefined
  })

  it('下载子进程上报的失败保留错误码', async () => {
    const { id } = await setup()
    mock.stats!({
      id,
      files: [],
      downloadSpeed: 0,
      peers: 0,
      error: encodeUserError({
        code: 'downloads.transfer_failed',
        message: '下载失败，请检查目录、空间或网络后重试',
      }),
    })
    const task = (await service!.list()).tasks[0]
    expect(task.state).toBe('error')
    expect(decodeUserError(task.error)?.code).toBe('downloads.transfer_failed')
  })

  it('没有错误码的失败只保存原说明，不加标记', async () => {
    const { id } = await setup()
    await service!.pause(id)
    mock.start.mockRejectedValueOnce(new Error('模拟进程异常'))
    await expect(service!.resume(id)).rejects.toThrow('模拟进程异常')
    expect((await service!.list()).tasks[0].error).toBe('模拟进程异常')
  })

  it('用户可处理的操作失败抛出带错误码的错误', async () => {
    const { id } = await setup()
    await expect(service!.filePath(id, 0)).rejects.toMatchObject({ code: 'downloads.not_finished' })
    await expect(service!.selectFiles(id, [9])).rejects.toMatchObject({
      code: 'downloads.no_files_selected',
    })
    await expect(service!.confirm(randomUUID(), [0], mock.directory)).rejects.toMatchObject({
      code: 'downloads.expired',
    })
  })
})

it('保存失败停止引擎并向用户报告错误', async () => {
  const { id } = await setup()
  vi.spyOn(DownloadRepository.prototype, 'save').mockRejectedValueOnce(new Error('ENOSPC'))
  await expect(service!.pause(id)).rejects.toThrow('保存失败')
  expect(mock.shutdown).toHaveBeenCalled()
  const reason = (await service!.list()).error
  expect(reason).toContain('已停止传输')
  // 整个服务不可用的原因同样带错误码，页面据此按界面语言显示
  expect(decodeUserError(reason)?.code).toBe('downloads.persist_failed')
  // 之后的操作抛出同一个带错误码的错误
  await expect(service!.resume(id)).rejects.toMatchObject({ code: 'downloads.persist_failed' })
  vi.restoreAllMocks()
})

it('旧版持续做种记录升级后离线校验并停止，清理废弃字段', async () => {
  const { content, task } = await setup()
  await writeFile(join(task.directory, 'sample.mkv'), content)
  await service!.shutdown()
  const path = join(mock.directory, 'downloads', 'tasks.json')
  const data = JSON.parse(await readFile(path, 'utf8'))
  data.settings.policy = 'forever'
  Object.assign(data.tasks[0], {
    state: 'seeding',
    intent: 'running',
    policy: 'forever',
    ratioBaseBytes: content.length,
    uploadedBytes: 10,
    seedingMs: 100,
  })
  delete data.tasks[0].selectedBytes
  await writeFile(path, JSON.stringify(data))
  mock.start.mockClear()
  service = new DownloadService()
  await vi.waitFor(
    async () => expect((await service!.list()).tasks[0].state).toBe('completed'),
    WAIT_OPTIONS,
  )
  expect(mock.start).not.toHaveBeenCalled()
  const restored = (await service.list()).tasks[0]
  expect(restored.intent).toBe('stopped')
  expect(restored.selectedBytes).toBe(content.length)
  expect(restored).not.toHaveProperty('policy')
  expect(restored).not.toHaveProperty('seedingMs')
  expect(await service.filePath(task.id, 0)).toBe(join(task.directory, 'sample.mkv'))
})

it('未完成时继续下载，完成后等待引擎断开才显示已完成', async () => {
  const { id, content } = await setup()
  mock.stop.mockClear()
  mock.stats!({
    id,
    files: [{ index: 0, verifiedBytes: 1, complete: false }],
    downloadSpeed: 1,
    peers: 1,
  })
  expect((await service!.list()).tasks[0].state).toBe('downloading')
  expect(mock.stop).not.toHaveBeenCalled()
  let stopped!: () => void
  mock.stop.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        stopped = resolve
      }),
  )
  mock.stats!({
    id,
    files: [{ index: 0, verifiedBytes: content.length, complete: true }],
    downloadSpeed: 0,
    peers: 1,
  })
  await vi.waitFor(() => expect(mock.stop).toHaveBeenCalledWith(id), WAIT_OPTIONS)
  expect((await service!.list()).tasks[0].state).toBe('pausing')
  stopped()
  await vi.waitFor(
    async () => expect((await service!.list()).tasks[0].state).toBe('completed'),
    WAIT_OPTIONS,
  )
  expect((await service!.list()).tasks[0].peers).toBe(0)
})

it('取消全部文件保留数据，重新选择保持暂停并可继续', async () => {
  const { id, task, content } = await setup()
  await writeFile(join(task.directory, 'sample.mkv'), content)
  mock.start.mockClear()
  await service!.selectFiles(id, [])
  expect((await service!.list()).tasks[0]).toMatchObject({
    state: 'paused',
    selectedBytes: 0,
    intent: 'paused',
  })
  expect(await readFile(join(task.directory, 'sample.mkv'))).toEqual(content)
  await expect(service!.resume(id)).rejects.toThrow('请先选择')
  await service!.selectFiles(id, [0])
  expect(mock.start).not.toHaveBeenCalled()
  expect((await service!.list()).tasks[0].selectedBytes).toBe(content.length)
  await service!.resume(id)
  expect(mock.start).toHaveBeenCalledWith(id, expect.anything(), task.directory, [0])
})

it('无效选集不会中断正在下载的任务', async () => {
  const { id } = await setup()
  mock.stop.mockClear()
  await expect(service!.selectFiles(id, [999])).rejects.toThrow('有效文件')
  await expect(service!.selectFiles(id, [0, 0])).rejects.toThrow('有效文件')
  expect(mock.stop).not.toHaveBeenCalled()
  expect((await service!.list()).tasks[0].intent).toBe('running')
})

it('下载中替换集数，完成后追加未完成集数会重新启动', async () => {
  const { id, content, task } = await setup(true)
  await service!.selectFiles(id, [1])
  expect(mock.start).toHaveBeenLastCalledWith(id, expect.anything(), task.directory, [1])
  mock.stats!({
    id,
    files: [
      { index: 0, complete: false, verifiedBytes: 0 },
      { index: 1, complete: true, verifiedBytes: content.length },
    ],
    downloadSpeed: 0,
    peers: 0,
  })
  await vi.waitFor(
    async () => expect((await service!.list()).tasks[0].state).toBe('completed'),
    WAIT_OPTIONS,
  )
  await service!.selectFiles(id, [0, 1])
  expect(mock.start).toHaveBeenLastCalledWith(id, expect.anything(), task.directory, [0, 1])
  expect((await service!.list()).tasks[0]).toMatchObject({
    intent: 'running',
    state: 'checking',
    selectedBytes: content.length * 2,
  })
  expect((await service!.list()).tasks[0].completedAt).toBeUndefined()
})

it('删除合集文件同时清理任务空目录，保留用户保存目录', async () => {
  const { id, task, content } = await setup(true)
  await writeFile(join(task.directory, 'sample.mkv', '01.mkv'), content)
  await service!.remove(id, true, () => false)
  await expect(stat(join(task.directory, 'sample.mkv'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await stat(task.directory)).isDirectory()).toBe(true)
  expect((await service!.list()).tasks).toHaveLength(0)
})

it('收到字节但未通过校验不能误报完成，并保留校验失败诊断', async () => {
  const { id } = await setup()
  mock.stats!({
    id,
    files: [{ index: 0, complete: false, verifiedBytes: 0 }],
    receivedBytes: 100000,
    hashFailures: 2,
    downloadSpeed: 1000,
    peers: 2,
  })
  const task = (await service!.list()).tasks[0]
  expect(task).toMatchObject({ state: 'downloading', receivedBytes: 100000, hashFailures: 2 })
  expect(task.files[0].complete).toBe(false)
  expect(task.files[0].verifiedBytes).toBe(0)
  await expect(service!.filePath(id, 0)).rejects.toThrow('尚未下载完成')
})
