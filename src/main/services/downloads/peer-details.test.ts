import type { Torrent } from 'webtorrent'
import { describe, expect, it } from 'vitest'
import { peerDetails } from './peer-details'

describe('节点明细', () => {
  const wire = {
    peerId: 'test',
    remoteAddress: '::1',
    remotePort: 6881,
    downloadSpeed: () => 1024,
    uploadSpeed: () => 0,
    downloaded: 2048,
    uploaded: 128,
    peerChoking: false,
    amInterested: true,
    peerPieces: { get: (i: number) => i === 0 },
  }
  const snapshot = (overrides = {}, pieces = 2) =>
    peerDetails({
      wires: [{ ...wire, ...overrides }],
      pieces: Array.from({ length: pieces }).fill(null),
    } as unknown as Pick<Torrent, 'wires' | 'pieces'>)[0]
  it('格式化 IPv6，统计远端分片并保留连接传输量', () => {
    expect(snapshot()).toMatchObject({
      address: '[::1]:6881',
      availablePercent: 50,
      downloaded: 2048,
      uploaded: 128,
      state: 'downloading',
    })
  })
  it('区分等待许可、等待传输与无所需分片，不将连接数视作传输数', () => {
    expect(snapshot({ downloadSpeed: () => 0, peerChoking: true }).state).toBe('choked')
    expect(snapshot({ downloadSpeed: () => 0 }).state).toBe('ready')
    expect(snapshot({ downloadSpeed: () => 0, amInterested: false }).state).toBe('unneeded')
  })
  it('无地址和零分片时不伪造数据', () => {
    expect(snapshot({ remoteAddress: undefined }, 0)).toMatchObject({
      address: '地址不可用',
      availablePercent: null,
    })
  })
})
