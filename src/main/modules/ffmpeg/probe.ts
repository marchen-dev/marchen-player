import type {
  MediaDisposition,
  MediaDynamicRange,
  MediaProbeResult,
  MediaStream,
  MediaStreamBase,
} from '@marchen/shared/media'

type FfprobeObject = Record<string, unknown>

const objectValue = (value: unknown): FfprobeObject =>
  typeof value === 'object' && value !== null ? (value as FfprobeObject) : {}

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const finiteNumber = (value: unknown): number | undefined => {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(number) ? number : undefined
}

const integer = (value: unknown): number | undefined => {
  const number = finiteNumber(value)
  return number !== undefined && Number.isInteger(number) ? number : undefined
}

const rational = (value: unknown): number | undefined => {
  if (typeof value !== 'string') return finiteNumber(value)
  const match = value.match(/^(-?\d+)\/(-?\d+)$/)
  if (!match) return finiteNumber(value)
  const denominator = Number(match[2])
  if (denominator === 0) return undefined
  const result = Number(match[1]) / denominator
  return Number.isFinite(result) ? result : undefined
}

const disposition = (stream: FfprobeObject): MediaDisposition => {
  const value = objectValue(stream.disposition)
  return {
    default: finiteNumber(value.default) === 1,
    forced: finiteNumber(value.forced) === 1,
    attachedPicture: finiteNumber(value.attached_pic) === 1,
  }
}

const tags = (stream: FfprobeObject) => {
  const value = objectValue(stream.tags)
  return { language: optionalString(value.language), title: optionalString(value.title) }
}

const bitDepth = (stream: FfprobeObject): number | undefined => {
  const explicit = integer(stream.bits_per_raw_sample) ?? integer(stream.bits_per_sample)
  if (explicit && explicit > 0) return explicit
  const pixelFormat = optionalString(stream.pix_fmt)?.toLowerCase()
  if (!pixelFormat) return undefined
  const match = pixelFormat.match(/(?:p|^p)(10|12|14|16)(?:le|be)?$/)
  if (match) return Number(match[1])
  if (/^(?:yuv|nv12|rgb|bgr)/.test(pixelFormat)) return 8
  return undefined
}

const rotation = (stream: FfprobeObject): number | undefined => {
  const tagRotation = finiteNumber(objectValue(stream.tags).rotate)
  if (tagRotation !== undefined) return tagRotation
  const sideData = Array.isArray(stream.side_data_list) ? stream.side_data_list : []
  for (const entry of sideData) {
    const value = objectValue(entry)
    const sideRotation = finiteNumber(value.rotation)
    if (sideRotation !== undefined) return sideRotation
  }
  return undefined
}

const dynamicRange = (stream: FfprobeObject): MediaDynamicRange => {
  const codec = optionalString(stream.codec_name)?.toLowerCase() ?? ''
  const profile = optionalString(stream.profile)?.toLowerCase() ?? ''
  const transfer = optionalString(stream.color_transfer)?.toLowerCase() ?? ''
  const primaries = optionalString(stream.color_primaries)?.toLowerCase() ?? ''
  const sideData = JSON.stringify(stream.side_data_list ?? '').toLowerCase()
  if (codec.includes('dovi') || profile.includes('dolby vision') || sideData.includes('dovi')) {
    return 'dolby-vision'
  }
  if (transfer === 'arib-std-b67') return 'hlg'
  if (transfer === 'smpte2084') return 'hdr10'
  if (transfer && !['unknown', 'unspecified', 'reserved'].includes(transfer)) return 'sdr'
  // BT.2020 原色和高位深都可能出现在 SDR；缺少 transfer 时不得猜测 HDR。
  if (primaries && ['bt709', 'smpte170m', 'bt470bg'].includes(primaries)) return 'sdr'
  return 'unknown'
}

const h264ProfileIdc = (profile: string | undefined): number | undefined => {
  if (!profile) return undefined
  const normalized = profile.toLowerCase()
  if (normalized.includes('baseline')) return 66
  if (normalized.includes('main')) return 77
  if (normalized.includes('high')) return 100
  return undefined
}

/**
 * ffprobe 9 仍不会为多数 HEVC 流输出 mime_codec_string。这里仅推导项目目标 MP4/MSE
 * 所需的稳定子集；无法可靠表达的 codec 保持 unknown，交给目标 init segment 再探测。
 */
export const deriveTargetCodecString = (stream: FfprobeObject): string | undefined => {
  const codec = optionalString(stream.codec_name)?.toLowerCase()
  const profile = optionalString(stream.profile)
  const level = integer(stream.level)
  switch (codec) {
    case 'h264': {
      const profileIdc = h264ProfileIdc(profile)
      if (profileIdc === undefined || level === undefined) return undefined
      const constraints = profile?.toLowerCase().includes('constrained') ? 0xC0 : 0
      return `avc1.${profileIdc.toString(16).padStart(2, '0')}${constraints
        .toString(16)
        .padStart(2, '0')}${level.toString(16).padStart(2, '0')}`
    }
    case 'hevc':
      if (level === undefined) return undefined
      if (profile?.toLowerCase() === 'main') return `hvc1.1.6.L${level}.B0`
      if (profile?.toLowerCase() === 'main 10') return `hvc1.2.4.L${level}.B0`
      return undefined
    case 'aac':
      return 'mp4a.40.2'
    case 'eac3':
      return 'ec-3'
    case 'ac3':
      return 'ac-3'
    case 'flac':
      return 'fLaC'
    case 'opus':
      return 'opus'
    default:
      return undefined
  }
}

const baseStream = (stream: FfprobeObject): MediaStreamBase => {
  const probedCodecString = optionalString(stream.mime_codec_string)
  const derivedCodecString = probedCodecString ? undefined : deriveTargetCodecString(stream)
  return {
    index: integer(stream.index) ?? -1,
    codecName: optionalString(stream.codec_name) ?? 'unknown',
    codecString: probedCodecString ?? derivedCodecString,
    codecStringSource: probedCodecString ? 'ffprobe' : derivedCodecString ? 'derived' : 'unknown',
    codecLongName: optionalString(stream.codec_long_name),
    codecTag: optionalString(stream.codec_tag_string),
    profile: optionalString(stream.profile),
    startTime: finiteNumber(stream.start_time),
    duration: finiteNumber(stream.duration),
    disposition: disposition(stream),
    tags: tags(stream),
  }
}

const normalizeStream = (value: unknown): MediaStream => {
  const stream = objectValue(value)
  const base = baseStream(stream)
  switch (stream.codec_type) {
    case 'video': {
      const depth = bitDepth(stream)
      return {
        ...base,
        type: 'video',
        level: integer(stream.level),
        width: integer(stream.width) ?? 0,
        height: integer(stream.height) ?? 0,
        pixelFormat: optionalString(stream.pix_fmt),
        bitDepth: depth,
        frameRate: rational(stream.r_frame_rate),
        averageFrameRate: rational(stream.avg_frame_rate),
        sampleAspectRatio: optionalString(stream.sample_aspect_ratio),
        displayAspectRatio: optionalString(stream.display_aspect_ratio),
        rotation: rotation(stream),
        colorRange: optionalString(stream.color_range),
        colorSpace: optionalString(stream.color_space),
        colorTransfer: optionalString(stream.color_transfer),
        colorPrimaries: optionalString(stream.color_primaries),
        dynamicRange: dynamicRange(stream),
      }
    }
    case 'audio':
      return {
        ...base,
        type: 'audio',
        sampleRate: integer(stream.sample_rate),
        channels: integer(stream.channels),
        channelLayout: optionalString(stream.channel_layout),
        bitRate: finiteNumber(stream.bit_rate),
      }
    case 'subtitle':
      return { ...base, type: 'subtitle' }
    default:
      return { ...base, type: 'unknown' }
  }
}

export const normalizeFfprobeOutput = (sourceId: string, value: unknown): MediaProbeResult => {
  const root = objectValue(value)
  const format = objectValue(root.format)
  const streams = Array.isArray(root.streams) ? root.streams.map(normalizeStream) : []
  return {
    sourceId,
    formatNames: optionalString(format.format_name)?.split(',').filter(Boolean) ?? [],
    formatLongName: optionalString(format.format_long_name),
    startTime: finiteNumber(format.start_time) ?? 0,
    duration: Math.max(0, finiteNumber(format.duration) ?? 0),
    bitRate: finiteNumber(format.bit_rate),
    streams,
  }
}
