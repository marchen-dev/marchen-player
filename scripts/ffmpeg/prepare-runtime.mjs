import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '../..')
const manifestPath = join(scriptDirectory, 'runtime-manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const readArgument = (name) => {
  const prefix = `--${name}=`
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
}

const targetName = readArgument('target') ?? `${process.platform}-${process.arch}`
const target = manifest.targets[targetName]
if (!target) {
  throw new Error(
    `不支持 FFmpeg 目标 ${targetName}；可用目标：${Object.keys(manifest.targets).join(', ')}`,
  )
}

const outputRoot = resolve(repositoryRoot, readArgument('output') ?? 'resources/ffmpeg')
const finalDirectory = join(outputRoot, targetName)
const temporaryRoot = mkdtempSync(join(tmpdir(), `marchen-ffmpeg-${targetName}-`))
const stagingDirectory = join(temporaryRoot, 'staging')
mkdirSync(stagingDirectory, { recursive: true })

const download = async (url, destination) => {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`下载失败 ${response.status} ${response.statusText}：${url}`)
  }
  mkdirSync(dirname(destination), { recursive: true })
  const output = createWriteStream(destination, { flags: 'wx' })
  await finished(Readable.fromWeb(response.body).pipe(output))
}

const sha256 = async (path) => {
  const hash = createHash('sha256')
  const stream = createReadStream(path)
  stream.on('data', (chunk) => hash.update(chunk))
  await finished(stream)
  return hash.digest('hex')
}

const extractZip = (archive, destination) => {
  mkdirSync(destination, { recursive: true })
  const result = spawnSync('tar', ['-xf', archive, '-C', destination], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.error) throw new Error(`无法启动归档工具 tar：${result.error.message}`)
  if (result.status !== 0) {
    throw new Error(`解压 ${basename(archive)} 失败：${result.stderr || `退出码 ${result.status}`}`)
  }
}

const findFiles = (root, filename, results = []) => {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) findFiles(path, filename, results)
    else if (entry.isFile() && entry.name === filename) results.push(path)
  }
  return results
}

const installExecutable = (searchRoot, executableName) => {
  const candidates = findFiles(searchRoot, executableName)
  if (candidates.length !== 1) {
    throw new Error(
      `归档内 ${executableName} 数量应为 1，实际为 ${candidates.length}：${candidates.join(', ')}`,
    )
  }
  const destination = join(stagingDirectory, executableName)
  copyFileSync(candidates[0], destination)
  if (target.platform !== 'win32') chmodSync(destination, 0o755)
}

const acquireBuildInformation = async () => {
  const informationDirectory = join(stagingDirectory, 'build-info')
  mkdirSync(informationDirectory, { recursive: true })
  const entries = {
    build: target.buildConfigurationUrl,
    ...target.capabilityUrls,
  }
  for (const [name, url] of Object.entries(entries)) {
    if (!url) continue
    await download(url, join(informationDirectory, `${name}.txt`))
  }
}

try {
  const downloadedArtifacts = []
  for (const artifact of target.artifacts) {
    const archive = join(temporaryRoot, `${artifact.name}.zip`)
    await download(artifact.url, archive)
    const actualSha256 = await sha256(archive)
    if (actualSha256 !== artifact.sha256) {
      throw new Error(
        `${targetName}/${artifact.name} SHA-256 不匹配：期望 ${artifact.sha256}，实际 ${actualSha256}`,
      )
    }

    const extracted = join(temporaryRoot, `extracted-${artifact.name}`)
    extractZip(archive, extracted)
    const executableNames = artifact.executables
      ? artifact.executables.map((path) => basename(path))
      : [artifact.executable]
    for (const executableName of executableNames) installExecutable(extracted, executableName)
    downloadedArtifacts.push({
      name: artifact.name,
      url: artifact.url,
      sha256: actualSha256,
    })
  }

  for (const executableName of target.platform === 'win32'
    ? ['ffmpeg.exe', 'ffprobe.exe']
    : ['ffmpeg', 'ffprobe']) {
    const executable = join(stagingDirectory, executableName)
    if (!existsSync(executable) || !statSync(executable).isFile()) {
      throw new Error(`准备结果缺少 ${executableName}`)
    }
  }

  await acquireBuildInformation()
  writeFileSync(
    join(stagingDirectory, 'runtime-metadata.json'),
    `${JSON.stringify(
      {
        schemaVersion: manifest.schemaVersion,
        ffmpegRelease: manifest.ffmpegRelease,
        source: manifest.source,
        target: targetName,
        versionOutputPrefix: target.versionOutputPrefix,
        provider: target.provider,
        providerSource: target.providerSource,
        commonCapabilities: manifest.commonCapabilities,
        platformEncoders: target.platformEncoders,
        artifacts: downloadedArtifacts,
      },
      null,
      2,
    )}\n`,
  )

  mkdirSync(outputRoot, { recursive: true })
  const previousDirectory = `${finalDirectory}.previous`
  if (existsSync(previousDirectory)) rmSync(previousDirectory, { recursive: true, force: true })
  if (existsSync(finalDirectory)) renameSync(finalDirectory, previousDirectory)
  try {
    renameSync(stagingDirectory, finalDirectory)
    if (existsSync(previousDirectory)) rmSync(previousDirectory, { recursive: true, force: true })
  } catch (error) {
    if (!existsSync(finalDirectory) && existsSync(previousDirectory)) {
      renameSync(previousDirectory, finalDirectory)
    }
    throw error
  }

  console.log(`FFmpeg 运行时已准备：${finalDirectory}`)
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
