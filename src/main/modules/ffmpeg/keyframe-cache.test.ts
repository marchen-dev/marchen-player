import type { MediaSourceFingerprint } from '@marchen/shared/media'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { KeyframeMetadataCache, keyframeCacheFileName } from './keyframe-cache'

const temporaryDirectories: string[] = []
const source: MediaSourceFingerprint = {
  schemaVersion: 1,
  sourceId: 'hash',
  pathKey: 'non-reversible-path-key',
  size: 100,
  mtimeMs: 1,
}
const metadata = {
  sourceStartTime: 5,
  duration: 30,
  durationReliable: true,
  keyframes: [0, 10, 20],
  extractor: 'matroska-metadata' as const,
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

const setup = async () => {
  const root = await mkdtemp(join(tmpdir(), 'marchen-keyframe-cache-'))
  temporaryDirectories.push(root)
  return { root, cache: new KeyframeMetadataCache(root, () => 123) }
}

describe('关键帧元数据缓存', () => {
  it('原子保存并读取数字元数据，不写入媒体路径或内容', async () => {
    const { root, cache } = await setup()
    await cache.set(source, metadata)
    expect(await cache.get(source)).toEqual(metadata)
    const entries = await readdir(root)
    expect(entries).toEqual([keyframeCacheFileName(source)])
    const serialized = await readFile(join(root, entries[0]!), 'utf8')
    expect(serialized).not.toContain('/Users')
    expect(serialized).not.toContain('/Volumes')
    expect(serialized).not.toContain('.mkv')
    expect(entries.some((name) => name.endsWith('.tmp'))).toBe(false)
  })

  it.each([
    ['size', { size: 101 }],
    ['mtime', { mtimeMs: 2 }],
    ['schema', { schemaVersion: 2 as never }],
  ])('%s 变化时缓存 miss', async (_label, overrides) => {
    const { cache } = await setup()
    await cache.set(source, metadata)
    await expect(cache.get({ ...source, ...overrides })).resolves.toBeUndefined()
  })

  it('损坏 JSON 降级为 miss 并移除坏文件', async () => {
    const { root, cache } = await setup()
    const file = join(root, keyframeCacheFileName(source))
    await writeFile(file, '{broken')
    await expect(cache.get(source)).resolves.toBeUndefined()
    await expect(cache.entries()).resolves.toEqual([])
  })

  it('拒绝非单调或空关键帧记录', async () => {
    const { cache } = await setup()
    await expect(cache.set(source, { ...metadata, keyframes: [0, 10, 9] })).rejects.toThrow(
      '记录无效',
    )
    await expect(cache.set(source, { ...metadata, keyframes: [] })).rejects.toThrow('记录无效')
  })
})
