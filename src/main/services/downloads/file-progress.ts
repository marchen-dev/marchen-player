/** 引擎分片状态的只读视图，便于脱离 WebTorrent 单独测试 */
export interface PieceView {
  pieceLength: number
  /** 种子总字节数，用于推算最后一片的实际长度 */
  length: number
  verified: (index: number) => boolean
  /** 未确认分片里已经收到的字节；不含重复传输和被丢弃的数据 */
  received: (index: number) => number
}

export interface FileProgress {
  /** 整片确认通过的字节，决定完成与可播放 */
  verifiedBytes: number
  /** 面向用户的下载进度：已确认字节加上在下分片已收到的部分 */
  downloadedBytes: number
}

/**
 * 按分片与文件的重叠范围累加进度。边界分片同时属于相邻文件，
 * 未确认时按重叠比例分摊已收到的字节，避免把邻接文件的数据算进来。
 */
export function fileProgress(file: { offset: number; length: number }, view: PieceView): FileProgress {
  let verifiedBytes = 0
  let partialBytes = 0
  if (file.length <= 0 || view.pieceLength <= 0) return { verifiedBytes, downloadedBytes: 0 }
  const fileEnd = file.offset + file.length
  const start = Math.floor(file.offset / view.pieceLength)
  const end = Math.ceil(fileEnd / view.pieceLength)
  for (let i = start; i < end; i++) {
    const pieceStart = i * view.pieceLength
    const pieceEnd = Math.min(pieceStart + view.pieceLength, view.length)
    const overlap = Math.max(0, Math.min(fileEnd, pieceEnd) - Math.max(file.offset, pieceStart))
    if (!overlap) continue
    if (view.verified(i)) {
      verifiedBytes += overlap
      continue
    }
    const pieceSize = pieceEnd - pieceStart
    const received = Math.min(pieceSize, Math.max(0, view.received(i)))
    if (pieceSize > 0) partialBytes += (overlap * received) / pieceSize
  }
  return {
    verifiedBytes,
    downloadedBytes: Math.min(file.length, verifiedBytes + Math.floor(partialBytes)),
  }
}
