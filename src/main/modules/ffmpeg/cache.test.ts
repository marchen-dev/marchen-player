import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { MediaCacheManager } from './cache'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

const createRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), 'marchen-cache-test-'))
  temporaryDirectories.push(root)
  return root
}

describe('mediaCacheManager', () => {
  it('创建带 marker 的会话，并按预算拒绝继续写入', async () => {
    const root = await createRoot()
    const manager = new MediaCacheManager({
      root,
      sessionBudgetBytes: 64,
      minimumFreeBytes: 0,
      freeSpace: async () => 1_000,
    })
    const session = await manager.createSession()
    const marker = JSON.parse(
      await readFile(join(session.directory, '.marchen-media-session.json'), 'utf8'),
    )
    expect(marker).toMatchObject({ kind: 'marchen-media-session', sessionId: session.sessionId })

    await writeFile(join(session.directory, 'segment.m4s'), Buffer.alloc(48))
    await expect(session.reserve(32)).rejects.toMatchObject({ code: 'cache-budget-exceeded' })
  })

  it('空间下限不足时不创建会话', async () => {
    const root = await createRoot()
    const manager = new MediaCacheManager({
      root,
      minimumFreeBytes: 100,
      freeSpace: async () => 99,
    })

    await expect(manager.createSession()).rejects.toMatchObject({ code: 'disk-space-low' })
  })

  it('启动清扫只删除超过 TTL 且带有效 marker 的孤立目录', async () => {
    const root = await createRoot()
    let now = 1_000
    const manager = new MediaCacheManager({
      root,
      ttlMs: 100,
      minimumFreeBytes: 0,
      now: () => now,
      freeSpace: async () => 1_000,
    })
    const active = await manager.createSession()
    const unmarked = join(root, '用户目录')
    await mkdir(unmarked)
    await writeFile(join(unmarked, 'keep.txt'), 'keep')
    const invalid = join(root, 'session-invalid')
    await mkdir(invalid)
    await writeFile(join(invalid, '.marchen-media-session.json'), '{}')

    now += 101
    expect(await manager.sweepExpired()).toEqual([])
    await active.release()

    const orphan = join(root, 'session-orphan')
    await mkdir(orphan)
    await writeFile(
      join(orphan, '.marchen-media-session.json'),
      JSON.stringify({
        kind: 'marchen-media-session',
        schemaVersion: 1,
        sessionId: 'orphan',
        createdAt: 1_000,
      }),
    )
    expect(await manager.sweepExpired()).toEqual(['session-orphan'])
    await expect(readFile(join(unmarked, 'keep.txt'), 'utf8')).resolves.toBe('keep')
    await expect(readFile(join(invalid, '.marchen-media-session.json'), 'utf8')).resolves.toBe('{}')
  })
})
