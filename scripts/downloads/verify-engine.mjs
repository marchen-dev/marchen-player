/** 本地 TCP peer 验证，不访问公网 tracker，不使用用户视频。 */
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import WebTorrent from 'webtorrent'

const parseTorrent = (await import('parse-torrent')).default
const bencode = (await import('bencode')).default
const root = resolve('.tmp/test-results/downloads')
await mkdir(root, { recursive: true })
const run = await mkdtemp(join(root, 'engine-'))
const source = join(run, 'source')
const destination = join(run, 'destination')
await mkdir(source)
await mkdir(destination)
const clients = new Set()
const results = []
const config = { dht: false, tracker: false, lsd: false, natUpnp: false, natPmp: false, utp: false }
const client = () => {
  const value = new WebTorrent(config)
  clients.add(value)
  value.on('error', (error) => {
    console.error(error)
    process.exitCode = 1
  })
  return value
}
const until = async (predicate, label, timeout = 30000) => {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error(`超时：${label}`)
    await delay(25)
  }
}
const add = (c, input) =>
  new Promise((resolve, reject) => {
    const torrent = c.add(input, { path: destination, deselect: true })
    torrent.once('error', reject)
    torrent.once('ready', () => resolve(torrent))
  })
const destroy = (c) =>
  new Promise((resolve, reject) =>
    c.destroy((error) => {
      clients.delete(c)
      error ? reject(error) : resolve()
    }),
  )
const remove = (c, torrent) =>
  new Promise((resolve, reject) =>
    c.remove(torrent, { destroyStore: false }, (error) => (error ? reject(error) : resolve())),
  )
const record = (name, details = {}) => {
  results.push({ name, passed: true, ...details })
  console.log(`PASS ${name}`)
}
const verifiedBytes = (t) =>
  t.pieces.reduce(
    (sum, _, i) =>
      sum +
      (t.bitfield.get(i) ? (i === t.pieces.length - 1 ? t.lastPieceLength : t.pieceLength) : 0),
    0,
  )
const hash = (value) => createHash('sha256').update(value).digest('hex')
try {
  // 不整除 pieceLength，确保测试到跨文件边界。
  const content = randomBytes(4 * 1024 * 1024 + 113)
  await writeFile(join(source, '01.mkv'), content)
  await writeFile(join(source, '02.mkv'), randomBytes(2 * 1024 * 1024 + 57))
  const seedClient = client()
  const seed = await new Promise((resolve, reject) => {
    const t = seedClient.seed(source, { announce: [], pieceLength: 65536 }, resolve)
    t.once('error', reject)
  })
  const metadata = seed.torrentFile
  await writeFile(join(run, 'fixture.torrent'), metadata)
  const parsed = await parseTorrent(metadata)
  assert.equal(parsed.files.length, 2)
  record('BT v1 元数据解析', { infoHash: parsed.infoHash })
  const v2 = bencode.encode({
    info: {
      name: 'v2',
      'meta version': 2,
      'piece length': 16384,
      'file tree': { 'sample.mkv': { '': { length: 1, 'pieces root': Buffer.alloc(32) } } },
    },
  })
  await assert.rejects(parseTorrent(v2), /pieces/)
  record('纯 v2 被解析器拒绝')
  // 检查是否静默只解析混合种子的 v1 部分；产品需在解析前另行拒绝 meta version=2。
  const hybrid = bencode.decode(metadata)
  hybrid.info['meta version'] = 2
  hybrid.info['file tree'] = { placeholder: { '': { length: 0 } } }
  const hybridParsed = await parseTorrent(bencode.encode(hybrid))
  assert.equal(hybridParsed.files.length, 2)
  record('解析器忽略附加 v2 字段', {
    productPolicy: '首版拒绝 meta version=2；非完整混合种子兼容证明',
  })
  let receiver = client()
  let t = await add(receiver, metadata)
  t.addPeer(`127.0.0.1:${seedClient.torrentPort}`)
  await until(() => t.numPeers > 0, 'peer 连接')
  await delay(800)
  assert.equal(t.downloaded, 0)
  record('确认前无有效载荷下载')
  receiver.throttleDownload(256 * 1024)
  t.files[0].select()
  await until(() => verifiedBytes(t) >= 131072, '下载部分数据')
  const before = verifiedBytes(t)
  await remove(receiver, t)
  assert.equal(t.destroyed, true)
  assert.equal(t.wires.length, 0)
  const sent = seed.uploaded
  await delay(500)
  assert.equal(seed.uploaded, sent)
  record('关闭任务停止传输且保留 store', { verifiedBytes: before })
  await destroy(receiver)
  receiver = client()
  t = await add(receiver, metadata)
  assert.ok(verifiedBytes(t) >= before)
  record('重建 client 校验恢复已有片段', { verifiedBytes: t.downloaded })
  t.files[0].select()
  t.addPeer(`127.0.0.1:${seedClient.torrentPort}`)
  await until(() => t.files[0].done, '选中文件完成')
  assert.equal(t.files[1].done, false)
  assert.equal(t.done, false)
  const downloaded = await readFile(join(destination, t.files[0].path))
  assert.equal(hash(downloaded), hash(content))
  record('选中文件完整且 SHA256 一致，整个合集尚未完成', {
    selectedBytes: content.length,
    verifiedBytes: t.downloaded,
  })
  await remove(receiver, t)
  await destroy(receiver)
  const crashPath = join(run, 'crash')
  const child = fork(
    fileURLToPath(new URL('./crash-receiver.mjs', import.meta.url)),
    [join(run, 'fixture.torrent'), crashPath, String(seedClient.torrentPort)],
    { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] },
  )
  let crashBytes
  try {
    crashBytes = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('强制退出准备超时')), 30000)
      child.once('message', (message) => {
        clearTimeout(timer)
        resolve(message.verifiedBytes)
      })
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', () => {
        clearTimeout(timer)
        reject(new Error('验证子进程提前退出'))
      })
    })
  } finally {
    await new Promise((resolve) => {
      child.once('exit', resolve)
      child.kill('SIGKILL')
    })
  }
  const recoveredClient = client()
  const recovered = await new Promise((resolve, reject) => {
    const t = recoveredClient.add(metadata, { path: crashPath, deselect: true })
    t.once('ready', () => resolve(t))
    t.once('error', reject)
  })
  assert.ok(verifiedBytes(recovered) >= crashBytes)
  record('SIGKILL 后重新校验复用已落盘片段', { verifiedBytes: verifiedBytes(recovered) })
  await destroy(recoveredClient)
  const magnetClient = client()
  const pending = magnetClient.add(`magnet:?xt=urn:btih:${seed.infoHash}`, {
    path: join(run, 'magnet'),
    deselect: true,
  })
  pending.on('error', (error) => {
    throw error
  })
  await until(() => pending.infoHash, '磁力标识')
  pending.addPeer(`127.0.0.1:${seedClient.torrentPort}`)
  await until(() => pending.ready, '磁力获取元数据')
  await delay(500)
  assert.equal(pending.downloaded, 0)
  record('磁力获取文件清单且不下载有效载荷')
} finally {
  await Promise.all([...clients].map(destroy))
  await writeFile(
    join(run, 'result.json'),
    JSON.stringify(
      { node: process.version, platform: process.platform, arch: process.arch, results },
      null,
      2,
    ),
  )
  console.log(`证据目录：${run}`)
}
