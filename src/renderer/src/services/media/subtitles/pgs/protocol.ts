import type { CompatSource } from '../../compat/protocol'

/** PGS 会话失败或降级的稳定原因码，供遥测聚合（design 第 8 节） */
export type PgsSessionErrorCode =
  /** 字幕轨没有索引，也无法借视频索引定位 */
  | 'index_missing'
  /** 回溯超过上限，当前位置暂不显示 */
  | 'backtrack_exceeded'
  /** 字幕块结构损坏 */
  | 'block_invalid'
  /** 显示集解析或合成失败 */
  | 'decode_failed'
  /** 读取来源失败 */
  | 'read_failed'
  /** Worker 启动或运行失败 */
  | 'worker_failed'

export interface PgsTrackRef {
  number: number
  uid: string
  codec: string
}

export type PgsWorkerRequest =
  | {
      type: 'open'
      source: CompatSource
      track: PgsTrackRef
      /** 容器未声明视频传递函数时的补充判断（例如兼容内核探测到的 PQ / HLG） */
      hdrHint?: boolean
    }
  /** 播放位置变化；generation 变化表示跳转、换偏移等需要丢弃旧结果的操作 */
  | { type: 'update'; time: number; generation: number; playing: boolean }
  | { type: 'close' }

export interface PgsBitmapRect {
  x: number
  y: number
  width: number
  height: number
  bitmap: ImageBitmap
}

/** 一个显示集的合成结果；rects 为空表示清屏。坐标属于 PGS 画布 */
export interface PgsBitmapFrame {
  /** 块在文件中的位置，作为稳定 ID（扫描与索引得到的值一致） */
  key: number
  start: number
  /** 下一个显示集的开始时间；尚不知道时为 Infinity */
  end: number
  width: number
  height: number
  rects: PgsBitmapRect[]
}

export interface PgsSessionStats {
  /** 从打开到第一次送出有内容的位图的耗时；没有显示过字幕时为 undefined */
  firstBitmapMs?: number
  readBytes: number
  maxBacktrack: number
  scanUsed: boolean
  blockFailures: number
  decodeFailures: number
  hdr: boolean
}

export type PgsWorkerReply =
  | { type: 'ready'; mode: 'index' | 'scan'; hdr: boolean }
  | {
      type: 'frames'
      generation: number
      frames: PgsBitmapFrame[]
      /** 仍需保留的帧 key；主线程应释放不在其中的位图 */
      keep: number[]
      /** 已送出帧的结束时间更新（扫描模式下，下一句被扫描到后才知道） */
      ends: [key: number, end: number][]
    }
  | { type: 'stats'; stats: PgsSessionStats }
  | { type: 'error'; code: PgsSessionErrorCode; message: string; fatal: boolean }
