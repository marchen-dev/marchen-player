import type { FfmpegExecutionOptions, FfmpegExecutionResult } from './executor'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FfmpegProcessExecutor } from './executor'
import { createMediaSourceFingerprint } from './source-fingerprint'
import { probeTargetInit } from './target-init-probe'
import { createMediaValidationCacheKey, MediaValidationCache } from './validation-cache'

const temporaryDirectories: string[] = []
const success = (stdout = Buffer.alloc(0)): FfmpegExecutionResult => ({
  code: 0,
  signal: null,
  stdout,
  stderr: '',
  durationMs: 1,
})

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

const createRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), 'marchen-target-probe-test-'))
  temporaryDirectories.push(root)
  return root
}

describe('target init probe', () => {
  it('限制输入/时长/输出并返回实际 sample entry 与 init fingerprint', async () => {
    const root = await createRoot()
    const input = join(root, 'input.mkv')
    await writeFile(input, 'input')
    const calls: FfmpegExecutionOptions[] = []
    const executor = {
      run: async (options: FfmpegExecutionOptions) => {
        calls.push(options)
        if (options.executable === 'ffmpeg') {
          await writeFile(options.arguments.at(-1)!, 'fragmented-mp4')
          return success()
        }
        return success(
          Buffer.from(
            JSON.stringify({
              streams: [
                {
                  index: 0,
                  id: '0x1',
                  codec_name: 'hevc',
                  codec_tag_string: 'hvc1',
                  profile: 'Main 10',
                  level: 120,
                  time_base: '1/16000',
                  extradata: '00000000: 0102 0304',
                  extradata_size: 4,
                },
              ],
            }),
          ),
        )
      },
    }

    const result = await probeTargetInit({
      ffmpeg: 'ffmpeg',
      ffprobe: 'ffprobe',
      executor,
      workRoot: root,
      inputPath: input,
      videoStreamIndex: 0,
      videoCodecName: 'hevc',
      durationSeconds: 99,
    })

    expect(result.video).toMatchObject({ codecName: 'hevc', sampleEntry: 'hvc1' })
    expect(result.fingerprint.tracks[0]).toMatchObject({
      trackId: '0x1',
      timeBase: '1/16000',
      extradataSize: 4,
    })
    expect(calls[0]).toMatchObject({
      inputs: [input],
      allowedInputProtocols: ['file'],
      timeoutMs: 5_000,
      stderrLimitBytes: 16 * 1024,
    })
    expect(calls[0].arguments).toContain('3')
    expect(await readdir(root)).toEqual(['input.mkv'])
  })

  it('超过输出限制时失败并清理临时目录', async () => {
    const root = await createRoot()
    const input = join(root, 'input.mkv')
    await writeFile(input, 'input')
    await expect(
      probeTargetInit({
        ffmpeg: 'ffmpeg',
        ffprobe: 'ffprobe',
        executor: {
          run: async (options) => {
            await writeFile(options.arguments.at(-1)!, Buffer.alloc(32))
            return success()
          },
        },
        workRoot: root,
        inputPath: input,
        videoStreamIndex: 0,
        videoCodecName: 'h264',
        maxOutputBytes: 16,
      }),
    ).rejects.toThrow('输出超过')
    expect(await readdir(root)).toEqual(['input.mkv'])
  })
})

const runtimeDirectory = resolve('resources', 'ffmpeg', `${process.platform}-${process.arch}`)
const suffix = process.platform === 'win32' ? '.exe' : ''
const ffmpeg = join(runtimeDirectory, `ffmpeg${suffix}`)
const ffprobe = join(runtimeDirectory, `ffprobe${suffix}`)
const fixture = resolve('test-results/media-compat/hevc-main8-aac.mp4')

describe.runIf(existsSync(ffmpeg) && existsSync(ffprobe) && existsSync(fixture))(
  '真实 target init probe',
  () => {
    it('把 HEVC copy 规范为 Chromium 可接受的 hvc1', async () => {
      const root = await createRoot()
      const result = await probeTargetInit({
        ffmpeg,
        ffprobe,
        executor: new FfmpegProcessExecutor(),
        workRoot: root,
        inputPath: fixture,
        videoStreamIndex: 0,
        videoCodecName: 'hevc',
        audioStreamIndex: 1,
      })
      expect(result.video).toMatchObject({ codecName: 'hevc', sampleEntry: 'hvc1' })
      expect(result.audio?.codecName).toBe('aac')
      expect(result.fingerprint.tracks).toHaveLength(2)
      expect(await readdir(root)).toEqual([])
    })

    it('真实 target probe 可由源/轨道 key 合并复用', async () => {
      const root = await createRoot()
      const source = await createMediaSourceFingerprint(fixture, 'fixture-hash')
      const cache = new MediaValidationCache<Awaited<ReturnType<typeof probeTargetInit>>>()
      const key = createMediaValidationCacheKey({
        source,
        videoStreamIndex: 0,
        audioStreamIndex: 1,
        target: 'fmp4-copy',
      })
      let calls = 0
      const load = () => {
        calls += 1
        return probeTargetInit({
          ffmpeg,
          ffprobe,
          executor: new FfmpegProcessExecutor(),
          workRoot: root,
          inputPath: fixture,
          videoStreamIndex: 0,
          videoCodecName: 'hevc',
          audioStreamIndex: 1,
        })
      }

      const [first, second] = await Promise.all([
        cache.getOrCreate(key, load),
        cache.getOrCreate(key, load),
      ])
      expect(first).toBe(second)
      expect(calls).toBe(1)
      expect(await readdir(root)).toEqual([])
    })
  },
)
