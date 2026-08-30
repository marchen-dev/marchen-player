import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execute = promisify(execFile)
const directories: string[] = []
const script = resolve('scripts/verify-observability-build.mjs')

const fixture = async (content: string, withMap = false) => {
  const directory = await mkdtemp(join(tmpdir(), 'marchen-observability-'))
  directories.push(directory)
  await writeFile(join(directory, 'app.js'), content)
  if (withMap) await writeFile(join(directory, 'app.js.map'), '{}')
  return directory
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('observability build gate', () => {
  it('accepts matching Web metadata without maps or Electron SDK', async () => {
    const directory = await fixture('release-1 web')
    await expect(
      execute(process.execPath, [
        script,
        '--root',
        directory,
        '--target',
        'web',
        '--expected-release',
        'release-1',
        '--expected-dist',
        'web',
        '--require-no-maps',
      ]),
    ).resolves.toMatchObject({ stdout: expect.stringContaining('verified') })
  })

  it.each([
    ['map remains', 'release-1 web', true],
    ['Electron SDK leaked', 'release-1 web @sentry/electron', false],
    ['metadata mismatch', 'another-release web', false],
  ])('rejects when %s', async (_case, content, withMap) => {
    const directory = await fixture(content, withMap)
    await expect(
      execute(process.execPath, [
        script,
        '--root',
        directory,
        '--target',
        'web',
        '--expected-release',
        'release-1',
        '--expected-dist',
        'web',
        '--require-no-maps',
      ]),
    ).rejects.toBeDefined()
  })
})
