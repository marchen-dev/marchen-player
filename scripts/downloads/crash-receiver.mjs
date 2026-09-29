/** 验证进程被终止后磁盘片段是否可重用，仅由 verify-engine 启动。 */
import { readFile } from 'node:fs/promises'
import WebTorrent from 'webtorrent'
const [metadataPath, destination, port] = process.argv.slice(2)
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
client.throttleDownload(256 * 1024)
const torrent = client.add(await readFile(metadataPath), { path: destination, deselect: true })
torrent.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
torrent.once('ready', () => {
  torrent.files[0].select()
  torrent.addPeer(`127.0.0.1:${port}`)
  const timer = setInterval(() => {
    let bytes = 0
    for (let i = 0; i < torrent.pieces.length; i++) {
      if (torrent.bitfield.get(i))
        bytes += i === torrent.pieces.length - 1 ? torrent.lastPieceLength : torrent.pieceLength
    }
    if (bytes >= 131072) {
      clearInterval(timer)
      // 校验位更新后仍等待写入队列落盘；强制退出不要求保留未落盘片段。
      setTimeout(() => process.send?.({ verifiedBytes: bytes }), 300)
    }
  }, 25)
})
