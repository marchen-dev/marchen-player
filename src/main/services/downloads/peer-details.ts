import type { DownloadPeer } from '@marchen/shared/downloads'
import type { Torrent } from 'webtorrent'

// WebTorrent 在协议连接上附加地址等运行时字段，类型包尚未完整覆盖。
interface PeerWire {
  peerId?: string
  remoteAddress?: string
  remotePort?: number
  downloadSpeed: () => number
  uploadSpeed: () => number
  downloaded: number
  uploaded: number
  peerChoking: boolean
  amInterested: boolean
  peerPieces: { get: (index: number) => boolean }
}
export function peerDetails(torrent: Pick<Torrent, 'wires' | 'pieces'>): DownloadPeer[] {
  return torrent.wires.map((value, index) => {
    const wire = value as unknown as PeerWire
    const downloadSpeed = wire.downloadSpeed()
    let available = 0
    for (let i = 0; i < torrent.pieces.length; i++) {
      if (wire.peerPieces.get(i)) available++
    }
    const host = wire.remoteAddress
    const address = host
      ? `${host.includes(':') ? `[${host}]` : host}:${wire.remotePort ?? '—'}`
      : '地址不可用'
    return {
      id: `${wire.peerId ?? 'peer'}-${index}`,
      address,
      downloadSpeed,
      uploadSpeed: wire.uploadSpeed(),
      downloaded: wire.downloaded,
      uploaded: wire.uploaded,
      availablePercent: torrent.pieces.length ? (available / torrent.pieces.length) * 100 : null,
      state:
        downloadSpeed > 0
          ? 'downloading'
          : !wire.amInterested
            ? 'unneeded'
            : wire.peerChoking
              ? 'choked'
              : 'ready',
    }
  })
}
