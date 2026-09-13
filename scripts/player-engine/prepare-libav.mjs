import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdir, readdir, readFile, rename, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(import.meta.url)
const packageDir = dirname(require.resolve('@suemor/libav-hevc/package.json'))
const manifest = JSON.parse(await readFile(join(packageDir, 'manifest.json'), 'utf8'))
const project = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
assert.equal(manifest.version, project.dependencies['@suemor/libav-hevc'])
assert.equal(manifest.upstreamVersion, '6.10.9.0', '升级上游时同步审核运行时加载入口')

// 先校验整套资源，再发布目录，避免把不同版本胶水和 WASM 混在一起。
for (const [name, expected] of Object.entries(manifest.files)) {
  assert.equal(basename(name), name)
  const bytes = await readFile(join(packageDir, 'dist', name))
  assert.equal(bytes.length, expected.bytes, name)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, name)
}
const parent = join(root, 'src/renderer/public/wasm/libav')
const target = join(parent, manifest.version)
const staging = `${target}.tmp-${process.pid}`
await mkdir(parent, { recursive: true })
try {
  await cp(join(packageDir, 'dist'), staging, { recursive: true })
  for (const name of ['manifest.json', 'LICENSE.md', 'THIRD-PARTY-LICENSES.txt', 'sources']) {
    await cp(join(packageDir, name), join(staging, name), { recursive: true })
  }
  await rm(target, { recursive: true, force: true })
  await rename(staging, target)
  // public 是自动生成的发布资源，仅保留本次锁定版本，旧实验资源不再随应用分发。
  for (const entry of await readdir(parent, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      entry.name !== manifest.version &&
      /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(entry.name)
    ) {
      await rm(join(parent, entry.name), { recursive: true, force: true })
    }
  }
} finally {
  await rm(staging, { recursive: true, force: true })
}
console.log(`HEVC 资源已校验并复制：@suemor/libav-hevc@${manifest.version}`)
