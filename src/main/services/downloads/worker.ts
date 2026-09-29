import type { Torrent, TorrentOptions } from 'webtorrent'
import type { EngineRequest, EngineResponse, EngineStats } from './engine-port'
import { DOWNLOAD_LIMITS } from '@marchen/shared/downloads'
import MemoryStore from 'memory-chunk-store'
import WebTorrent from 'webtorrent'
import { validateMagnet, validateMetadata } from './metadata'
import { safeTaskPath } from './paths'
import { peerDetails } from './peer-details'

const port = process.parentPort!
const client = new WebTorrent({ utp: false })
const torrents = new Map<string, Torrent>()
let generation = ''
const send = (message: EngineResponse) => port.postMessage(message)
const stop = async (id: string) => {
  const torrent = torrents.get(id)
  torrents.delete(id)
  if (torrent && !(torrent as Torrent & { destroyed: boolean }).destroyed)
    await new Promise<void>((resolve, reject) =>
      client.remove(torrent, { destroyStore: false }, (error) =>
        error ? reject(error) : resolve(),
      ),
    )
}
function stats(id: string, t: Torrent): EngineStats {
  // downloaded 包含未校验片段；逐文件统计只能累加 bitfield 确认的交集。
  const bitfield = (t as Torrent & { bitfield: { get: (index: number) => boolean } }).bitfield
  return {
    id,
    files: t.files.map((file, index) => {
      let bytes = 0
      const start = Math.floor(file.offset / t.pieceLength)
      const end = Math.ceil((file.offset + file.length) / t.pieceLength)
      for (let i = start; i < end; i++)
        if (bitfield.get(i))
          bytes += Math.max(
            0,
            Math.min(file.offset + file.length, (i + 1) * t.pieceLength) -
              Math.max(file.offset, i * t.pieceLength),
          )
      return { index, verifiedBytes: bytes, complete: bytes === file.length }
    }),
    downloadSpeed: t.downloadSpeed,
    peers: t.numPeers,
  }
}
client.on('error', () => {
  for (const id of torrents.keys())
    send({
      generation,
      stats: {
        id,
        files: [],
        downloadSpeed: 0,
        peers: 0,
        error: '下载引擎错误，请重试',
      },
    })
})
port.on('message', async ({ data }: { data: EngineRequest }) => {
  generation = data.generation
  const { command, requestId } = data
  try {
    if (command.kind === 'prepare' || command.kind === 'start') {
      const input = command.kind === 'prepare' ? command.input : command.metadata
      if (typeof input !== 'string') validateMetadata(input)
      const source = typeof input === 'string' ? validateMagnet(input) : Buffer.from(input)
      if (command.kind === 'start') {
        const b = await import('parse-torrent')
        const parsed = await b.default(Buffer.from(command.metadata))
        for (const file of parsed.files ?? []) await safeTaskPath(command.directory, file.path)
      }
      await stop(command.id)
      const draft = command.kind === 'prepare'
      const options: TorrentOptions = {
        deselect: true,
        strategy: 'rarest',
        ...(draft
          ? { store: MemoryStore as TorrentOptions['store'] }
          : { path: command.directory }),
      }
      const t = client.add(source, options)
      torrents.set(command.id, t)
      t.on('error', () =>
        send({
          generation,
          stats: {
            id: command.id,
            files: [],
            downloadSpeed: 0,
            peers: 0,
            error: '下载失败，请检查目录、空间或网络后重试',
          },
        }),
      )
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('获取种子信息或校验超时，请重试')),
          draft ? DOWNLOAD_LIMITS.metadataMs : 10 * 60 * 1000,
        )
        t.once('ready', () => {
          clearTimeout(timer)
          resolve()
        })
        t.once('error', () => {
          clearTimeout(timer)
          reject(new Error('下载引擎无法打开任务'))
        })
        t.once('close', () => {
          clearTimeout(timer)
          reject(new Error('任务已取消'))
        })
      })
      validateMetadata(t.torrentFile)
      if (draft) {
        const value = {
          draft: {
            id: command.id,
            infoHash: t.infoHash,
            name: t.name,
            files: t.files.map((f, index) => ({ index, path: f.path, size: f.length })),
          },
          metadata: t.torrentFile,
        }
        await stop(command.id)
        send({ generation, requestId, ok: true, value })
      } else {
        for (const index of command.selected) {
          if (!t.files[index]) throw new Error('所选文件不存在')
          t.files[index].select()
        }
        send({ generation, stats: stats(command.id, t) })
        send({ generation, requestId, ok: true })
      }
    } else if (command.kind === 'peers') {
      const torrent = torrents.get(command.id)
      send({ generation, requestId, ok: true, value: torrent?.ready ? peerDetails(torrent) : [] })
    } else if (command.kind === 'stop') {
      await stop(command.id)
      send({ generation, requestId, ok: true })
    } else if (command.kind === 'limit') {
      client.throttleUpload(command.bytes)
      send({ generation, requestId, ok: true })
    } else {
      clearInterval(timer)
      await new Promise<void>((resolve, reject) =>
        client.destroy((error) => (error ? reject(error) : resolve())),
      )
      send({ generation, requestId, ok: true })
      process.exit(0)
    }
  } catch (error) {
    if ('id' in command && command.kind !== 'peers') await stop(command.id).catch(() => {})
    send({
      generation,
      requestId,
      ok: false,
      message: error instanceof Error ? error.message : '下载操作失败',
    })
  }
})
const timer = setInterval(() => {
  for (const [id, torrent] of torrents)
    if (torrent.ready && !(torrent as Torrent & { destroyed: boolean }).destroyed)
      send({ generation, stats: stats(id, torrent) })
}, 500)
