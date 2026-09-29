import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import parseTorrent from 'parse-torrent'
import { safeTaskPath } from './paths'
/** 离线校验不启动 BT client，暂停任务在应用重启后不会偷偷联网。 */
export async function verifyFiles(metadata: Uint8Array, directory: string) {
  const parsed = await parseTorrent(metadata)
  const files = parsed.files ?? []
  const counts = files.map(() => 0)
  if (!parsed.pieces || !parsed.pieceLength) throw new Error('种子校验信息缺失')
  for (let index = 0; index < parsed.pieces.length; index++) {
    const start = index * parsed.pieceLength
    const end = Math.min(start + parsed.pieceLength, parsed.length ?? 0)
    const hasher = createHash('sha1')
    const parts: Array<{ file: number; bytes: number }> = []
    let valid = true
    for (let f = 0; f < files.length; f++) {
      const file = files[f]
      const left = Math.max(start, file.offset)
      const right = Math.min(end, file.offset + file.length)
      if (right <= left) continue
      try {
        const handle = await open(await safeTaskPath(directory, file.path), 'r')
        try {
          const buffer = Buffer.alloc(right - left)
          const result = await handle.read(buffer, 0, buffer.length, left - file.offset)
          if (result.bytesRead !== buffer.length) {
            valid = false
            break
          }
          hasher.update(buffer)
          parts.push({ file: f, bytes: buffer.length })
        } finally {
          await handle.close()
        }
      } catch {
        valid = false
        break
      }
    }
    if (valid && hasher.digest('hex') === parsed.pieces[index])
      for (const part of parts) counts[part.file] += part.bytes
  }
  return files.map((file, index) => ({
    index,
    verifiedBytes: counts[index],
    complete: counts[index] === file.length,
  }))
}
