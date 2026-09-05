import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FfmpegProcessExecutor } from './executor'
import {
  aacEncoderArguments,
  aacEncoderClass,
  createAacEncoderInitializationArguments,
  selectInitializedAacEncoder,
} from './audio-encoder'

describe('AAC encoder 选择', () => {
  it('macOS 优先 aac_at，初始化失败后回退 bundled aac', async () => {
    const attempts: string[] = []
    await expect(
      selectInitializedAacEncoder('darwin', new Set(['aac_at', 'aac']), async (encoder) => {
        attempts.push(encoder)
        if (encoder === 'aac_at') throw new Error('AudioToolbox failed')
      }),
    ).resolves.toBe('aac')
    expect(attempts).toEqual(['aac_at', 'aac'])
  })

  it('encoder-specific 参数不会把 aac_low 传给 aac_at', () => {
    expect(aacEncoderArguments('aac_at')).toEqual(['-c:a', 'aac_at'])
    expect(aacEncoderArguments('aac')).toEqual(['-c:a', 'aac', '-profile:a', 'aac_low'])
    expect(createAacEncoderInitializationArguments('aac_at')).not.toContain('aac_low')
    expect(aacEncoderClass('aac_at')).toBe('system')
    expect(aacEncoderClass('aac')).toBe('software')
  })

  it('强制 system/software 时不偷偷使用另一类 encoder', async () => {
    await expect(
      selectInitializedAacEncoder(
        'darwin',
        new Set(['aac_at', 'aac']),
        async () => undefined,
        'system',
      ),
    ).resolves.toBe('aac_at')
    await expect(
      selectInitializedAacEncoder(
        'darwin',
        new Set(['aac_at', 'aac']),
        async () => undefined,
        'software',
      ),
    ).resolves.toBe('aac')
  })
})

const ffmpeg = resolve('resources', 'ffmpeg', `${process.platform}-${process.arch}`, 'ffmpeg')
describe.runIf(existsSync(ffmpeg) && process.platform === 'darwin')('真实 aac_at 初始化', () => {
  it('使用合法参数输出 AAC', async () => {
    await expect(
      new FfmpegProcessExecutor().run({
        executable: ffmpeg,
        arguments: createAacEncoderInitializationArguments('aac_at'),
        inputs: [],
        timeoutMs: 5_000,
      }),
    ).resolves.toMatchObject({ code: 0 })
  })
})
