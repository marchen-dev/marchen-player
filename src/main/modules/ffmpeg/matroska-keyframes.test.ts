import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { extractMatroskaKeyframes, MatroskaKeyframeExtractionError } from './matroska-keyframes'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

describe('Matroska metadata 关键帧错误边界', () => {
  it('损坏文件返回 invalid-ebml', async () => {
    const root = await mkdtemp(join(tmpdir(), 'marchen-matroska-invalid-'))
    temporaryDirectories.push(root)
    const file = join(root, 'invalid.mkv')
    await writeFile(file, 'not-ebml')
    const error = await extractMatroskaKeyframes(file).catch((cause) => cause)
    expect(error).toBeInstanceOf(MatroskaKeyframeExtractionError)
    expect(error.code).toBe('invalid-ebml')
  })

  it('调用前取消不会读取文件', async () => {
    const controller = new AbortController()
    controller.abort()
    const error = await extractMatroskaKeyframes('/not/read.mkv', controller.signal).catch(
      (cause) => cause,
    )
    expect(error).toMatchObject({ code: 'cancelled' })
  })
})

const vfrFixture = resolve('test-results/media-compat/structure-vfr-nonzero-start.mkv')
const longGopFixture = resolve('test-results/media-compat/structure-main10-sdr-flac-long-gop.mkv')
describe.runIf(existsSync(vfrFixture) && existsSync(longGopFixture))(
  '真实 Matroska metadata 关键帧',
  () => {
    it('归一非零 start，并用 Info duration 得到视频逻辑跨度', async () => {
      const result = await extractMatroskaKeyframes(vfrFixture)
      expect(result.sourceStartTime).toBeCloseTo(5, 2)
      expect(result.duration).toBeCloseTo(29.966, 2)
      expect(result.keyframes[0]).toBe(0)
      expect(
        result.keyframes.every(
          (value, index) => index === 0 || value > result.keyframes[index - 1]!,
        ),
      ).toBe(true)
      expect(result.durationReliable).toBe(true)
    })

    it('读取长 GOP cues 并保留容器 timestamp scale', async () => {
      const result = await extractMatroskaKeyframes(longGopFixture)
      expect(result.timestampScaleNanoseconds).toBe(1_000_000)
      expect(result.keyframes).toEqual([0, 10, 20])
      expect(result.duration).toBeCloseTo(30, 2)
    })
  },
)
