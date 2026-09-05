import type { FileHandle } from 'node:fs/promises'
import { open } from 'node:fs/promises'

const IDS = {
  segment: 0x18538067,
  seekHead: 0x114d9b74,
  seek: 0x4dbb,
  seekId: 0x53ab,
  seekPosition: 0x53ac,
  info: 0x1549a966,
  timestampScale: 0x2ad7b1,
  duration: 0x4489,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  trackType: 0x83,
  cues: 0x1c53bb6b,
  cuePoint: 0xbb,
  cueTime: 0xb3,
  cueTrackPositions: 0xb7,
  cueTrack: 0xf7,
} as const

const VIDEO_TRACK_TYPE = 1
const MAX_ELEMENTS = 200_000
const DURATION_TAIL_TOLERANCE_SECONDS = 30

interface EbmlElement {
  id: number
  offset: number
  dataOffset: number
  dataSize: number
  endOffset: number
}

export type MatroskaKeyframeErrorCode =
  'cancelled' | 'invalid-ebml' | 'seek-head-missing' | 'cues-missing' | 'video-track-missing'

export class MatroskaKeyframeExtractionError extends Error {
  constructor(
    readonly code: MatroskaKeyframeErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'MatroskaKeyframeExtractionError'
  }
}

export interface MatroskaKeyframeData {
  sourceStartTime: number
  duration: number
  durationReliable: boolean
  keyframes: number[]
  timestampScaleNanoseconds: number
}

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new MatroskaKeyframeExtractionError('cancelled', '关键帧提取已取消')
}

const vintLength = (first: number, maximum: number): number => {
  for (let length = 1; length <= maximum; length += 1) {
    if ((first & (0x80 >> (length - 1))) !== 0) return length
  }
  throw new MatroskaKeyframeExtractionError('invalid-ebml', 'EBML VINT 长度无效')
}

const readHeader = async (
  handle: FileHandle,
  offset: number,
  fileSize: number,
  signal?: AbortSignal,
): Promise<EbmlElement> => {
  throwIfAborted(signal)
  if (offset < 0 || offset >= fileSize) {
    throw new MatroskaKeyframeExtractionError('invalid-ebml', 'EBML element 超出文件范围')
  }
  const buffer = Buffer.alloc(Math.min(16, fileSize - offset))
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset)
  if (bytesRead < 2) throw new MatroskaKeyframeExtractionError('invalid-ebml', 'EBML header 截断')
  const idLength = vintLength(buffer[0]!, 4)
  if (bytesRead <= idLength)
    throw new MatroskaKeyframeExtractionError('invalid-ebml', 'EBML size 缺失')
  let id = 0
  for (let index = 0; index < idLength; index += 1) id = id * 256 + buffer[index]!

  const sizeLength = vintLength(buffer[idLength]!, 8)
  if (bytesRead < idLength + sizeLength) {
    throw new MatroskaKeyframeExtractionError('invalid-ebml', 'EBML size 截断')
  }
  const marker = 0x80 >> (sizeLength - 1)
  let size = BigInt(buffer[idLength]! & (marker - 1))
  for (let index = 1; index < sizeLength; index += 1) {
    size = size * 256n + BigInt(buffer[idLength + index]!)
  }
  const unknown = size === (1n << BigInt(7 * sizeLength)) - 1n
  const dataOffset = offset + idLength + sizeLength
  const dataSize = unknown ? fileSize - dataOffset : Number(size)
  if (!Number.isSafeInteger(dataSize) || dataSize < 0 || dataOffset + dataSize > fileSize) {
    throw new MatroskaKeyframeExtractionError('invalid-ebml', 'EBML element size 无效')
  }
  return { id, offset, dataOffset, dataSize, endOffset: dataOffset + dataSize }
}

const children = async (
  handle: FileHandle,
  container: EbmlElement,
  fileSize: number,
  signal?: AbortSignal,
): Promise<EbmlElement[]> => {
  const result: EbmlElement[] = []
  let offset = container.dataOffset
  while (offset < container.endOffset) {
    throwIfAborted(signal)
    if (result.length >= MAX_ELEMENTS) {
      throw new MatroskaKeyframeExtractionError('invalid-ebml', 'EBML element 数量超过限制')
    }
    const element = await readHeader(handle, offset, fileSize, signal)
    if (element.endOffset > container.endOffset || element.endOffset <= offset) {
      throw new MatroskaKeyframeExtractionError('invalid-ebml', 'EBML 子元素范围无效')
    }
    result.push(element)
    offset = element.endOffset
  }
  return result
}

const readBytes = async (handle: FileHandle, element: EbmlElement, maximum = 8) => {
  if (element.dataSize > maximum) {
    throw new MatroskaKeyframeExtractionError('invalid-ebml', 'EBML 标量长度超过限制')
  }
  const buffer = Buffer.alloc(element.dataSize)
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, element.dataOffset)
  if (bytesRead !== buffer.length) {
    throw new MatroskaKeyframeExtractionError('invalid-ebml', 'EBML 标量截断')
  }
  return buffer
}

const readUInt = async (handle: FileHandle, element: EbmlElement): Promise<number> => {
  const buffer = await readBytes(handle, element)
  let value = 0n
  for (const byte of buffer) value = value * 256n + BigInt(byte)
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw new MatroskaKeyframeExtractionError('invalid-ebml', 'EBML 整数超过安全范围')
  }
  return number
}

const readId = async (handle: FileHandle, element: EbmlElement): Promise<number> => {
  const buffer = await readBytes(handle, element, 4)
  let value = 0
  for (const byte of buffer) value = value * 256 + byte
  return value
}

const readFloat = async (handle: FileHandle, element: EbmlElement): Promise<number> => {
  const buffer = await readBytes(handle, element)
  if (buffer.length === 4) return buffer.readFloatBE(0)
  if (buffer.length === 8) return buffer.readDoubleBE(0)
  throw new MatroskaKeyframeExtractionError('invalid-ebml', 'EBML 浮点长度无效')
}

const findSegment = async (handle: FileHandle, fileSize: number, signal?: AbortSignal) => {
  let offset = 0
  for (let count = 0; count < 16 && offset < fileSize; count += 1) {
    const element = await readHeader(handle, offset, fileSize, signal)
    if (element.id === IDS.segment) return element
    offset = element.endOffset
  }
  throw new MatroskaKeyframeExtractionError('invalid-ebml', 'Matroska Segment 不存在')
}

const seekPositions = async (
  handle: FileHandle,
  segment: EbmlElement,
  fileSize: number,
  signal?: AbortSignal,
) => {
  const seekHead = (await children(handle, segment, fileSize, signal)).find(
    (element) => element.id === IDS.seekHead,
  )
  if (!seekHead) {
    throw new MatroskaKeyframeExtractionError('seek-head-missing', 'Matroska SeekHead 不存在')
  }
  const positions = new Map<number, number>()
  for (const seek of (await children(handle, seekHead, fileSize, signal)).filter(
    (element) => element.id === IDS.seek,
  )) {
    const entries = await children(handle, seek, fileSize, signal)
    const idElement = entries.find((element) => element.id === IDS.seekId)
    const positionElement = entries.find((element) => element.id === IDS.seekPosition)
    if (!idElement || !positionElement) continue
    positions.set(
      await readId(handle, idElement),
      segment.dataOffset + (await readUInt(handle, positionElement)),
    )
  }
  return positions
}

const elementAtExpected = async (
  handle: FileHandle,
  offset: number | undefined,
  expectedId: number,
  fileSize: number,
  errorCode: MatroskaKeyframeErrorCode,
  signal?: AbortSignal,
) => {
  if (offset === undefined)
    throw new MatroskaKeyframeExtractionError(errorCode, 'SeekHead 缺少目标位置')
  const element = await readHeader(handle, offset, fileSize, signal)
  if (element.id !== expectedId) {
    throw new MatroskaKeyframeExtractionError(errorCode, 'SeekHead 目标 element 不匹配')
  }
  return element
}

export const extractMatroskaKeyframes = async (
  inputPath: string,
  signal?: AbortSignal,
): Promise<MatroskaKeyframeData> => {
  throwIfAborted(signal)
  const handle = await open(inputPath, 'r')
  try {
    const fileSize = (await handle.stat()).size
    const segment = await findSegment(handle, fileSize, signal)
    const positions = await seekPositions(handle, segment, fileSize, signal)
    const info = await elementAtExpected(
      handle,
      positions.get(IDS.info),
      IDS.info,
      fileSize,
      'invalid-ebml',
      signal,
    )
    const infoChildren = await children(handle, info, fileSize, signal)
    const scaleElement = infoChildren.find((element) => element.id === IDS.timestampScale)
    const durationElement = infoChildren.find((element) => element.id === IDS.duration)
    const timestampScaleNanoseconds = scaleElement
      ? await readUInt(handle, scaleElement)
      : 1_000_000
    const rawDuration = durationElement ? await readFloat(handle, durationElement) : 0

    const tracks = await elementAtExpected(
      handle,
      positions.get(IDS.tracks),
      IDS.tracks,
      fileSize,
      'video-track-missing',
      signal,
    )
    let videoTrackNumber: number | undefined
    for (const track of (await children(handle, tracks, fileSize, signal)).filter(
      (element) => element.id === IDS.trackEntry,
    )) {
      const entries = await children(handle, track, fileSize, signal)
      const numberElement = entries.find((element) => element.id === IDS.trackNumber)
      const typeElement = entries.find((element) => element.id === IDS.trackType)
      if (!numberElement || !typeElement) continue
      if ((await readUInt(handle, typeElement)) === VIDEO_TRACK_TYPE) {
        videoTrackNumber = await readUInt(handle, numberElement)
        break
      }
    }
    if (videoTrackNumber === undefined) {
      throw new MatroskaKeyframeExtractionError('video-track-missing', 'Matroska 缺少视频轨道')
    }

    const cues = await elementAtExpected(
      handle,
      positions.get(IDS.cues),
      IDS.cues,
      fileSize,
      'cues-missing',
      signal,
    )
    const sourceKeyframes: number[] = []
    for (const cuePoint of (await children(handle, cues, fileSize, signal)).filter(
      (element) => element.id === IDS.cuePoint,
    )) {
      const cueEntries = await children(handle, cuePoint, fileSize, signal)
      const timeElement = cueEntries.find((element) => element.id === IDS.cueTime)
      if (!timeElement) continue
      let matchesVideo = false
      for (const positionsElement of cueEntries.filter(
        (element) => element.id === IDS.cueTrackPositions,
      )) {
        const trackElement = (await children(handle, positionsElement, fileSize, signal)).find(
          (element) => element.id === IDS.cueTrack,
        )
        if (trackElement && (await readUInt(handle, trackElement)) === videoTrackNumber) {
          matchesVideo = true
          break
        }
      }
      if (matchesVideo) {
        sourceKeyframes.push(
          ((await readUInt(handle, timeElement)) * timestampScaleNanoseconds) / 1_000_000_000,
        )
      }
    }
    if (sourceKeyframes.length === 0) {
      throw new MatroskaKeyframeExtractionError('cues-missing', 'Matroska Cues 没有视频关键帧')
    }
    const sourceStartTime = sourceKeyframes[0]!
    const keyframes = sourceKeyframes.map((time) => Math.max(0, time - sourceStartTime))
    const duration = Math.max(
      0,
      (rawDuration * timestampScaleNanoseconds) / 1_000_000_000 - sourceStartTime,
    )
    const trailingDuration = duration - keyframes.at(-1)!
    return {
      sourceStartTime,
      duration,
      durationReliable: duration > 0 && trailingDuration <= DURATION_TAIL_TOLERANCE_SECONDS,
      keyframes,
      timestampScaleNanoseconds,
    }
  } catch (error) {
    if (error instanceof MatroskaKeyframeExtractionError) throw error
    throw new MatroskaKeyframeExtractionError(
      signal?.aborted ? 'cancelled' : 'invalid-ebml',
      error instanceof Error ? error.message : 'Matroska metadata 读取失败',
    )
  } finally {
    await handle.close()
  }
}
