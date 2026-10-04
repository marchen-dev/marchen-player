import { DOWNLOAD_LIMITS } from '@marchen/shared/downloads'
import bencode from 'bencode'
import { describe, expect, it } from 'vitest'
import { validateMagnet, validateMetadata } from './metadata'
const torrent = (info: Record<string, unknown> = {}) =>
  bencode.encode({
    info: { name: 'sample', length: 1, pieces: Buffer.alloc(20), 'piece length': 16384, ...info },
  })
describe('下载输入边界', () => {
  it('允许 v1 并拒绝 v2、超预算和危险路径', () => {
    expect(() => validateMetadata(torrent())).not.toThrow()
    expect(() => validateMetadata(torrent({ 'meta version': 2 }))).toThrow('v2')
    expect(() => validateMetadata(new Uint8Array(DOWNLOAD_LIMITS.torrentBytes + 1))).toThrow(
      '8 MiB',
    )
    expect(() => validateMetadata(torrent({ name: '../unsafe' }))).toThrow('路径')
    expect(() => validateMetadata(torrent({ 'piece length': 2 ** 30 }))).toThrow('分块')
    expect(() =>
      validateMetadata(
        torrent({
          files: Array.from({ length: DOWNLOAD_LIMITS.files + 1 }, () => ({
            length: 1,
            path: ['x'],
          })),
        }),
      ),
    ).toThrow('数量')
  })
  it('磁力只接受 v1 且移除直接取资源参数', () => {
    const valid = `magnet:?xt=urn:btih:${'a'.repeat(40)}`
    expect(validateMagnet(`${valid}&ws=https://example.com/file`)).not.toContain('ws=')
    expect(() => validateMagnet(`${valid}&xt=urn:btmh:123`)).toThrow('v1')
    expect(() => validateMagnet('https://example.com')).toThrow('v1')
    expect(() => validateMagnet(valid + 'x'.repeat(DOWNLOAD_LIMITS.magnetChars))).toThrow('过长')
  })
})
