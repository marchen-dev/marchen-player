import { existsSync } from 'node:fs'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execPath } from 'node:process'

import { afterEach, describe, expect, it } from 'vitest'

import { FfmpegExecutionError, FfmpegProcessExecutor } from './executor'

const executor = new FfmpegProcessExecutor()
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  )
})

describe('ffmpegProcessExecutor', () => {
  it('关闭 stdin，并使用参数数组安全传递特殊字符', async () => {
    const value = '含 空格;$(不会执行)'
    const result = await executor.run({
      executable: execPath,
      arguments: [
        '-e',
        "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write(process.argv[1]))",
        value,
      ],
    })

    expect(result.stdout.toString()).toBe(value)
  })

  it('通过独立 fd 解析 progress，不混入 stdout', async () => {
    const records: Array<Record<string, string>> = []
    const result = await executor.run({
      executable: execPath,
      arguments: [
        '-e',
        // 真实 FFmpeg 的相邻 progress 批次通常没有空行，continue 自身就是分隔符。
        "require('fs').writeSync(3, 'frame=12\\nout_time_ms=2000000\\nprogress=continue\\nprogress=end\\n')",
      ],
      progress: true,
      onProgress: (record) => records.push({ ...record }),
    })

    expect(result.stdout.byteLength).toBe(0)
    expect(records).toEqual([
      { frame: '12', out_time_ms: '2000000', progress: 'continue' },
      { progress: 'end' },
    ])
  })

  it('异常退出时只保留 stderr 尾部窗口', async () => {
    const result = executor.run({
      executable: execPath,
      arguments: ['-e', "process.stderr.write('a'.repeat(200) + 'TAIL'); process.exit(7)"],
      stderrLimitBytes: 32,
    })

    await expect(result).rejects.toMatchObject({
      failure: 'exit',
      code: 7,
      stderr: `${'a'.repeat(28)}TAIL`,
    })
  })

  it('在启动进程前拒绝非本地输入协议', async () => {
    const result = executor.run({
      executable: '/definitely/not/started',
      arguments: [],
      inputs: ['https://example.com/video.mkv'],
    })

    await expect(result).rejects.toMatchObject({ failure: 'input-denied' })
  })

  it('标准输出超过上限时终止进程并返回结构化错误', async () => {
    const result = executor.run({
      executable: execPath,
      arguments: ['-e', "process.stdout.write('x'.repeat(4096)); setInterval(() => {}, 1000)"],
      stdoutLimitBytes: 256,
      gracefulShutdownMs: 50,
    })

    await expect(result).rejects.toMatchObject({ failure: 'output-limit' })
  })

  it('支持 AbortSignal 取消并回收进程', async () => {
    const controller = new AbortController()
    const execution = executor.start({
      executable: execPath,
      arguments: ['-e', 'setInterval(() => {}, 1000)'],
      signal: controller.signal,
      gracefulShutdownMs: 50,
    })
    controller.abort()

    await expect(execution.result).rejects.toMatchObject({ failure: 'cancelled' })
  })

  it('超时后先终止再强制清理忽略 SIGTERM 的进程', async () => {
    const startedAt = Date.now()
    const result = executor.run({
      executable: execPath,
      arguments: [
        '-e',
        "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000)",
      ],
      timeoutMs: 80,
      gracefulShutdownMs: 50,
    })

    await expect(result).rejects.toBeInstanceOf(FfmpegExecutionError)
    await expect(result).rejects.toMatchObject({ failure: 'timeout' })
    expect(Date.now() - startedAt).toBeLessThan(2_000)
  })
})

const preparedFfprobe = resolve(
  'resources',
  'ffmpeg',
  `${process.platform}-${process.arch}`,
  process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
)

describe.runIf(existsSync(preparedFfprobe))('真实 ffprobe 损坏媒体边界', () => {
  it('有限时间退出且诊断不会越过 stderr 窗口', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'marchen-corrupt-media-'))
    temporaryDirectories.push(directory)
    const input = join(directory, '损坏 视频.mkv')
    await writeFile(input, Buffer.alloc(128 * 1024, 0xFF))
    if (process.platform !== 'win32') await chmod(preparedFfprobe, 0o755)

    const startedAt = Date.now()
    const result = executor.run({
      executable: preparedFfprobe,
      arguments: ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', input],
      inputs: [input],
      kind: 'probe',
      timeoutMs: 2_000,
      stdoutLimitBytes: 64 * 1024,
      stderrLimitBytes: 1_024,
    })

    await expect(result).rejects.toMatchObject({ failure: 'exit' })
    try {
      await result
    } catch (error) {
      expect(error).toBeInstanceOf(FfmpegExecutionError)
      expect((error as FfmpegExecutionError).stderr.length).toBeLessThanOrEqual(1_024)
    }
    expect(Date.now() - startedAt).toBeLessThan(2_000)
  })
})
