import { execFileSync } from 'node:child_process'
import { access, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { verifyPackageResources } from './package-resources.mjs'
const require = createRequire(import.meta.url)
const installer = resolve(process.argv[2] || '')
if (!installer.endsWith('.exe')) throw new Error('请提供最终 NSIS 安装包')
const temp = await mkdtemp(join(tmpdir(), 'marchen-windows-'))
try {
  // GitHub Windows runner 自带 7-Zip；检查安装包内部数据，而非构建目录。
  const sevenZip = process.env.ProgramFiles ? join(process.env.ProgramFiles, '7-Zip/7z.exe') : '7z'
  execFileSync(sevenZip, ['x', '-y', `-o${temp}`, installer], { stdio: 'pipe' })
  const payload = join(temp, '$PLUGINSDIR/app-64.7z')
  await access(payload)
  const app = join(temp, 'app')
  execFileSync(sevenZip, ['x', '-y', `-o${app}`, payload], { stdio: 'pipe' })
  const executables = (await readdir(app)).filter(
    (name) => name.endsWith('.exe') && !name.startsWith('Uninstall'),
  )
  if (executables.length !== 1) throw new Error('Windows 应用主程序不明确')
  const pe = await readFile(join(app, executables[0]))
  const peOffset = pe.readUInt32LE(0x3C)
  if (pe.readUInt32LE(peOffset) !== 0x4550 || pe.readUInt16LE(peOffset + 4) !== 0x8664)
    throw new Error('Windows 主程序不是 x64')
  const entries = require('@electron/asar').listPackage(join(app, 'resources/app.asar'))
  verifyPackageResources(entries)
  console.log('最终 Windows NSIS 的 x64 架构与媒体资源检查通过')
} finally {
  await rm(temp, { recursive: true, force: true })
}
