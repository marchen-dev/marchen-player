import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sparkleBuildVersion } from '../../shared/src/update-policy.ts'
const root = fileURLToPath(new URL('../', import.meta.url))
const temp = await mkdtemp(join(tmpdir(), 'marchen-native-versions-'))
try {
  const sdk = execFileSync('xcrun', ['--sdk', 'macosx', '--show-sdk-path'], {
    encoding: 'utf8',
  }).trim()
  const vendor = resolve(root, 'vendor')
  const output = join(temp, 'check')
  execFileSync(
    'xcrun',
    [
      'clang',
      '-isysroot',
      sdk,
      '-fobjc-arc',
      '-framework',
      'Foundation',
      '-framework',
      'Sparkle',
      '-F',
      vendor,
      `-Wl,-rpath,${vendor}`,
      resolve(root, 'tests/version-comparator.m'),
      '-o',
      output,
    ],
    { stdio: 'inherit' },
  )
  execFileSync(
    output,
    [
      '1.0.0-alpha.0',
      '1.0.0-alpha.2',
      '1.0.0-alpha.10',
      '1.0.0-alpha.254',
      '1.0.0-beta.0',
      '1.0.0-beta.10',
      '1.0.0',
      '1.0.1-alpha.0',
      '1.0.1',
      '1.1.0-beta.0',
    ].map(sparkleBuildVersion),
    { stdio: 'inherit' },
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
