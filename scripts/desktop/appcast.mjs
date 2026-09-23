import { execFileSync } from 'node:child_process'
import { createPublicKey, verify } from 'node:crypto'
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import {
  compareReleaseVersions,
  parseReleaseVersion,
  sparkleBuildVersion,
} from '../../packages/shared/src/update-policy.ts'

const version = JSON.parse(await readFile('package.json', 'utf8')).version
const output = resolve(process.env.MARCHEN_RELEASE_DIR || 'dist')
const tag = process.env.MARCHEN_RELEASE_TAG
parseReleaseVersion(version)
if (tag !== `v${version}`) throw new Error('tag 与包版本不一致')
if (!process.env.SPARKLE_ED_PUBLIC_KEY) throw new Error('缺少待验证公钥')
const privateKey = process.env.SPARKLE_ED_PRIVATE_KEY?.trim()
if (!privateKey) throw new Error('缺少 Sparkle 发布私钥')
const temp = await mkdtemp(join(tmpdir(), 'marchen-appcast-'))
try {
  const keyFile = join(temp, 'key')
  await writeFile(keyFile, privateKey, { mode: 0o600 })
  const archive = join(temp, 'archives')
  await mkdir(archive)
  const filename = `Marchen-${version}-arm64.zip`
  await copyFile(resolve(output, filename), join(archive, filename))
  // 可选旧基线由 CI 提供；只作为补丁输入，不作为新发行产物上传。
  if (process.env.MARCHEN_DELTA_BASE_DIR) {
    for (const name of await readdir(process.env.MARCHEN_DELTA_BASE_DIR)) {
      const match = /^Marchen-(.+)-arm64\.zip$/.exec(name)
      let older = false
      try {
        older =
          !!match &&
          parseReleaseVersion(match[1]).channel === parseReleaseVersion(version).channel &&
          compareReleaseVersions(match[1], version) < 0
      } catch {
        /* 不使用未知基线。 */
      }
      if (older) await copyFile(join(process.env.MARCHEN_DELTA_BASE_DIR, name), join(archive, name))
    }
  }
  if (process.env.MARCHEN_RELEASE_NOTES)
    await copyFile(
      process.env.MARCHEN_RELEASE_NOTES,
      join(archive, filename.replace(/\.zip$/, '.md')),
    )
  execFileSync(
    resolve('packages/sparkle-updater/vendor/bin/generate_appcast'),
    [
      '-o',
      join(archive, 'appcast.xml'),
      '--versions',
      sparkleBuildVersion(version),
      '--maximum-versions',
      '1',
      '--maximum-deltas',
      '2',
      '--ed-key-file',
      keyFile,
      '--download-url-prefix',
      `https://github.com/marchen-dev/marchen-player/releases/download/${tag}/`,
      '--embed-release-notes',
      archive,
    ],
    { stdio: 'pipe' },
  )
  const signature = execFileSync(
    resolve('packages/sparkle-updater/vendor/bin/sign_update'),
    ['--ed-key-file', keyFile, '-p', join(archive, filename)],
    { encoding: 'utf8' },
  ).trim()
  const key = createPublicKey({
    key: Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      Buffer.from(process.env.SPARKLE_ED_PUBLIC_KEY, 'base64'),
    ]),
    format: 'der',
    type: 'spki',
  })
  if (!verify(null, await readFile(join(archive, filename)), key, Buffer.from(signature, 'base64')))
    throw new Error('发布公私钥不匹配')
  await access(join(archive, 'appcast.xml'))
  for (const name of await readdir(archive)) {
    if (name === 'appcast.xml')
      await copyFile(join(archive, name), resolve(output, 'appcast-macos-arm64.xml'))
    else if (name.endsWith('.delta'))
      await copyFile(join(archive, name), resolve(output, basename(name)))
  }
  console.log('正式 ARM64 appcast 与直接差分已生成')
} finally {
  await rm(temp, { recursive: true, force: true })
}
