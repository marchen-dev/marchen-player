/** 仅用于本机验收：将调用者指定的测试目录做成私有种子，不接入公网 DHT。 */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Server } from 'bittorrent-tracker'
import WebTorrent from 'webtorrent'
const [directory, output] = process.argv.slice(2)
if (!directory || !output) throw new Error('用法：node local-seeder.mjs <测试目录> <种子输出路径>')
const tracker = new Server({ http: true, udp: false, ws: false, stats: false })
tracker.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
await new Promise((resolve) => tracker.listen(0, '127.0.0.1', resolve))
const announce = `http://127.0.0.1:${tracker.http.address().port}/announce`
const client = new WebTorrent({ dht: false, lsd: false, utp: false, natUpnp: false, natPmp: false })
client.on('error', console.error)
client.throttleUpload(64 * 1024)
const torrent = await new Promise((resolve) =>
  client.seed(directory, { private: true, announce: [announce], pieceLength: 16384 }, resolve),
)
await writeFile(output, torrent.torrentFile)
console.log(JSON.stringify({ torrent: resolve(output), infoHash: torrent.infoHash, announce }))
const stop = () => client.destroy(() => tracker.close(() => process.exit(0)))
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
