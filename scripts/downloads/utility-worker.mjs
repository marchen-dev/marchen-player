import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebTorrent from 'webtorrent'
const client = new WebTorrent({
  dht: false,
  tracker: false,
  lsd: false,
  natUpnp: false,
  natPmp: false,
  utp: false,
})
client.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
client.once('listening', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'marchen-download-probe-'))
  const file = join(dir, 'probe')
  await writeFile(file, 'Marchen utilityProcess')
  if ((await readFile(file, 'utf8')) !== 'Marchen utilityProcess') throw new Error('读写校验失败')
  await rm(dir, { recursive: true })
  client.destroy((error) => {
    if (error) {
      console.error(error)
      process.exit(1)
    }
    process.parentPort.postMessage({
      ok: true,
      node: process.versions.node,
      electron: process.versions.electron,
      platform: process.platform,
      arch: process.arch,
      action: 'WebTorrent loaded; temporary file roundtrip verified; TCP listener closed',
    })
    process.exit(0)
  })
})
