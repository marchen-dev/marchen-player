import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createInstallIdentityStore } from './identity'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('install identity store', () => {
  it('returns one stable random identity across concurrent reads and store instances', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'marchen-identity-'))
    directories.push(directory)
    const filePath = join(directory, 'telemetry', 'identity.json')
    const store = createInstallIdentityStore(filePath)

    const [first, second] = await Promise.all([store.getOrCreate(), store.getOrCreate()])
    const restored = await createInstallIdentityStore(filePath).getOrCreate()

    expect(first).toBe(second)
    expect(restored).toBe(first)
    expect(JSON.parse(await readFile(filePath, 'utf8')).installId).toBe(first)
  })

  it('creates a new identity after reset', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'marchen-identity-'))
    directories.push(directory)
    const store = createInstallIdentityStore(join(directory, 'identity.json'))
    const first = await store.getOrCreate()

    await store.reset()

    expect(await store.getOrCreate()).not.toBe(first)
  })
})
