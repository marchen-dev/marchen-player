import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { MediaSessionRecoveryCoordinator, MediaSourceIntegrityMonitor } from './resilience'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

const source = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'marchen-resilience-'))
  temporaryDirectories.push(directory)
  const path = join(directory, 'video.mkv')
  await writeFile(path, 'original')
  const monitor = new MediaSourceIntegrityMonitor(path)
  await monitor.initialize()
  return { path, monitor }
}

describe('播放会话恢复策略', () => {
  it('睡眠唤醒后源和 generation 均健康则继续', async () => {
    const { monitor } = await source()
    const releaseGeneration = vi.fn(async () => {})
    const recovery = new MediaSessionRecoveryCoordinator({ source: monitor, releaseGeneration })
    recovery.suspend()
    await expect(recovery.resume(42, true)).resolves.toEqual({ action: 'continue' })
    expect(releaseGeneration).not.toHaveBeenCalled()
  })

  it('网络盘暂时不可读时释放旧 generation，并保留逻辑时间供重试', async () => {
    const { path, monitor } = await source()
    const releaseGeneration = vi.fn(async () => {})
    const recovery = new MediaSessionRecoveryCoordinator({ source: monitor, releaseGeneration })
    await unlink(path)
    recovery.suspend()
    await expect(recovery.resume(88, true)).resolves.toMatchObject({
      action: 'retry',
      logicalTime: 88,
      error: { code: 'source-unavailable', recoverable: true },
    })
    expect(releaseGeneration).toHaveBeenCalledOnce()
  })

  it('源文件变化时失败而非继续读取旧 generation', async () => {
    const { path, monitor } = await source()
    const releaseGeneration = vi.fn(async () => {})
    const recovery = new MediaSessionRecoveryCoordinator({ source: monitor, releaseGeneration })
    await writeFile(path, 'changed-and-longer')
    recovery.suspend()
    await expect(recovery.resume(10, true)).resolves.toMatchObject({
      action: 'failed',
      logicalTime: 10,
      error: { code: 'source-changed', recoverable: false },
    })
  })

  it('generation 中断时不形成内部循环，只返回显式重试点', async () => {
    const { monitor } = await source()
    const releaseGeneration = vi.fn(async () => {})
    const recovery = new MediaSessionRecoveryCoordinator({ source: monitor, releaseGeneration })
    await expect(
      recovery.interrupted(55, new Error('network share disconnected')),
    ).resolves.toEqual({
      action: 'retry',
      logicalTime: 55,
      error: {
        code: 'generation-failed',
        message: '媒体生产中断，可从当前逻辑时间重试',
        recoverable: true,
        cause: 'network share disconnected',
      },
    })
    expect(releaseGeneration).toHaveBeenCalledOnce()
  })
})
