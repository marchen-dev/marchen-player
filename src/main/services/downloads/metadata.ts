import { DOWNLOAD_LIMITS } from '@marchen/shared/downloads'
import bencode from 'bencode'
import { validateTorrentPath } from './paths'
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value))
    throw new Error('无效种子元数据')
  return value as Record<string, unknown>
}
function text(value: unknown) {
  if (!(value instanceof Uint8Array)) throw new Error('无效种子文件名')
  return new TextDecoder('utf-8', { fatal: true }).decode(value)
}
/** 在交给磁盘 store 前检查原始路径，避免解析库的规范化掩盖危险输入。 */
export function validateMetadata(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > DOWNLOAD_LIMITS.torrentBytes)
    throw new Error('种子文件超过 8 MiB 限制')
  const info = object(object(bencode.decode(bytes)).info)
  if (info['meta version'] !== undefined) throw new Error('目前只支持 BT v1，不支持 v2 或混合种子')
  if (
    typeof info['piece length'] !== 'number' ||
    !Number.isSafeInteger(info['piece length']) ||
    info['piece length'] < 16384 ||
    info['piece length'] > 16 * 1024 * 1024
  )
    throw new Error('种子分块大小超出支持范围')
  validateTorrentPath(text(info['name.utf-8'] ?? info.name))
  if (!(info.pieces instanceof Uint8Array) || info.pieces.length % 20 !== 0)
    throw new Error('无效 BT v1 校验信息')
  const names = new Set<string>()
  let total = 0
  if (info.files !== undefined) {
    if (!Array.isArray(info.files) || info.files.length > DOWNLOAD_LIMITS.files)
      throw new Error('种子文件数量超过限制')
    for (const entry of info.files) {
      const file = object(entry)
      const parts = file['path.utf-8'] ?? file.path
      if (!Array.isArray(parts)) throw new Error('无效文件路径')
      const path = validateTorrentPath(parts.map(text).join('/'))
      if (names.has(path.toLowerCase())) throw new Error('种子包含重名文件')
      names.add(path.toLowerCase())
      if (typeof file.length !== 'number' || !Number.isSafeInteger(file.length) || file.length < 0)
        throw new Error('无效文件大小')
      total += file.length
    }
  } else {
    if (typeof info.length !== 'number' || !Number.isSafeInteger(info.length) || info.length < 0)
      throw new Error('无效文件大小')
    total = info.length
  }
  if (
    !Number.isSafeInteger(total) ||
    info.pieces.length !== Math.ceil(total / info['piece length']) * 20
  )
    throw new Error('种子大小和分块校验数量不匹配')
}
export function validateMagnet(value: string) {
  if (value.length > DOWNLOAD_LIMITS.magnetChars) throw new Error('磁力链接过长')
  const url = new URL(value)
  if (
    url.protocol !== 'magnet:' ||
    url.searchParams.getAll('xt').some((x) => x.startsWith('urn:btmh:')) ||
    !url.searchParams.getAll('xt').some((x) => /^urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(x))
  )
    throw new Error('请输入 BT v1 磁力链接')
  // 只允许磁力发现，不允许通过 xs/as/ws 参数绕过确认获取任意 URL。
  for (const key of ['xs', 'as', 'ws']) url.searchParams.delete(key)
  // magnet-uri 的 xt 解析要求保留 urn:btih: 分隔符，不能整体 URLSearchParams 编码。
  return `magnet:?${[...url.searchParams].map(([key, item]) => `${encodeURIComponent(key)}=${key === 'xt' ? item : encodeURIComponent(item)}`).join('&')}`
}
