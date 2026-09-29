import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
// 本地 Electron 实测：node node_modules/electron/cli.js scripts/downloads/verify-http.mjs
import { app } from 'electron'
import { build } from 'esbuild'
async function main() {
  const root = await mkdtemp(join(tmpdir(), 'marchen-http-proof-'))
  await mkdir(join(root, 'profile'))
  app.setPath('userData', join(root, 'profile'))
  await build({
    entryPoints: ['src/main/services/downloads/http-engine.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    external: ['electron'],
    alias: { '@marchen/shared/downloads': './packages/shared/src/downloads.ts' },
    outfile: '.tmp/http-download-check/engine.mjs',
  })
  const { HttpDownloadEngine } = await import(
    pathToFileURL(join(process.cwd(), '.tmp/http-download-check/engine.mjs')).href
  )
  await app.whenReady()
  const body = Buffer.alloc(512 * 1024, 37)
  const ranges = []
  const server = createServer((req, res) => {
    if (req.headers.range) ranges.push(req.headers.range)
    const start = Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1] ?? 0)
    res.writeHead(start ? 206 : 200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': body.length - start,
      'Accept-Ranges': 'bytes',
      ETag: '"fixed-v1"',
      'Last-Modified': 'Mon, 28 Sep 2026 00:00:00 GMT',
      ...(start ? { 'Content-Range': `bytes ${start}-${body.length - 1}/${body.length}` } : {}),
    })
    let offset = start
    const timer = setInterval(() => {
      res.write(body.subarray(offset, offset + 8192))
      offset += 8192
      if (offset >= body.length) {
        clearInterval(timer)
        res.end()
      }
    }, 15)
    res.on('close', () => clearInterval(timer))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const tasks = []
  for (let i = 0; i < 4; i++) {
    const name = `${i}.mp4`
    const partialName = `${i}.part`
    await writeFile(join(root, name), '')
    await writeFile(join(root, partialName), '')
    tasks.push({
      id: `proof-${i}`,
      name,
      directory: root,
      http: {
        url: `${base}/${name}`,
        urlChain: [`${base}/${name}`],
        partialName,
        offset: 0,
        etag: '',
        lastModified: '',
      },
      files: [{ index: 0, path: name, selected: true, size: 0, verifiedBytes: 0, complete: false }],
      intent: 'paused',
      state: 'paused',
      selectedBytes: 0,
      downloadSpeed: 0,
      peers: 0,
    })
  }
  const engine = new HttpDownloadEngine(
    () => tasks,
    () => {},
  )
  const wait = async (predicate) => {
    const limit = Date.now() + 15000
    while (!predicate()) {
      if (Date.now() > limit)
        throw new Error(
          JSON.stringify(
            tasks.map((t) => ({ state: t.state, error: t.error, bytes: t.files[0].verifiedBytes })),
          ),
        )
      await new Promise((r) => setTimeout(r, 30))
    }
  }
  try {
    for (const task of tasks) engine.start(task)
    assert.equal(tasks[3].state, 'waiting')
    await wait(() => tasks[0].files[0].verifiedBytes > 0)
    engine.pause(tasks[0])
    assert.equal(tasks[0].state, 'paused')
    await wait(() => tasks[3].state === 'downloading' || tasks[3].state === 'completed')
    engine.start(tasks[0])
    await wait(() => tasks.every((t) => t.state === 'completed'))
    for (const task of tasks) assert.deepEqual(await readFile(join(root, task.name)), body)
    const restored = structuredClone(tasks[0])
    restored.id = 'proof-restored'
    restored.name = 'restored.mp4'
    restored.files = [
      {
        index: 0,
        path: 'restored.mp4',
        selected: true,
        size: body.length,
        verifiedBytes: 131072,
        complete: false,
      },
    ]
    restored.state = 'paused'
    restored.intent = 'paused'
    restored.http.partialName = 'restored.part'
    restored.http.offset = 131072
    await writeFile(join(root, restored.name), '')
    await writeFile(join(root, restored.http.partialName), body.subarray(0, 131072))
    tasks.push(restored)
    engine.start(restored)
    await wait(() => restored.state === 'completed')
    assert.deepEqual(await readFile(join(root, restored.name)), body)
    assert.ok(ranges.some((value) => value.startsWith('bytes=131072-')))
    console.log(
      'PASS: 4 HTTP tasks, 3 active slots, pause releases queue, resume, persisted offset restored with Range, exact file bytes, final rename',
    )
    await engine.shutdown()
    server.close()
    app.exit(0)
  } catch (e) {
    console.error(e)
    await engine.shutdown()
    server.close()
    app.exit(1)
  }
}
void main().catch((error) => {
  console.error(error)
  app.exit(1)
})
