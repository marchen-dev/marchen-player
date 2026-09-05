import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMediaSourceFingerprint } from './source-fingerprint'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

describe('媒体源指纹', () => {
  it('只暴露不可逆路径 key，并以 size/mtime 表达当前文件版本', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'marchen-source-fingerprint-'))
    temporaryDirectories.push(directory)
    const file = join(directory, '含 空格.mkv')
    await writeFile(file, 'first')
    const first = await createMediaSourceFingerprint(file, 'media-hash')

    expect(first).toMatchObject({ schemaVersion: 1, sourceId: 'media-hash', size: 5 })
    expect(first.pathKey).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(first)).not.toContain(directory)

    await writeFile(file, 'second-version')
    const nextTime = new Date(first.mtimeMs + 2_000)
    await utimes(file, nextTime, nextTime)
    const second = await createMediaSourceFingerprint(file, 'media-hash')

    expect(second.pathKey).toBe(first.pathKey)
    expect(second.size).not.toBe(first.size)
    expect(second.mtimeMs).toBeGreaterThan(first.mtimeMs)
  })
})
