const CODEC_ALIASES: Record<string, string> = {
  avc: 'h264',
  avc1: 'h264',
  h265: 'hevc',
  h_265: 'hevc',
  hev1: 'hevc',
  hvc1: 'hevc',
  vc_1: 'vc1',
  'vc-1': 'vc1',
  mpeg2: 'mpeg2video',
  mpeg_2_video: 'mpeg2video',
  e_ac_3: 'eac3',
  'e-ac-3': 'eac3',
  ac_3: 'ac3',
  'ac-3': 'ac3',
  dts: 'dca',
}

const DECODER_CANDIDATES: Record<string, readonly string[]> = {
  h264: ['h264'],
  hevc: ['hevc'],
  av1: ['libdav1d', 'libaom-av1', 'av1'],
  vp9: ['vp9'],
  vp8: ['vp8'],
  vc1: ['vc1'],
  wmv3: ['wmv3'],
  mpeg2video: ['mpeg2video'],
  mpeg4: ['mpeg4'],
  theora: ['theora'],
  aac: ['aac'],
  aac_latm: ['aac_latm', 'aac'],
  ac3: ['ac3'],
  eac3: ['eac3'],
  flac: ['flac'],
  opus: ['opus'],
  vorbis: ['vorbis'],
  mp2: ['mp2'],
  mp3: ['mp3float', 'mp3'],
  alac: ['alac'],
  truehd: ['truehd'],
  dca: ['dca'],
  pcm_s16le: ['pcm_s16le'],
  pcm_s24le: ['pcm_s24le'],
}

export const decodableCodecNamesForRuntime = (availableDecoders: ReadonlySet<string>): string[] =>
  Object.entries(DECODER_CANDIDATES)
    .filter(([, candidates]) => candidates.some((candidate) => availableDecoders.has(candidate)))
    .map(([codec]) => codec)
    .sort()

export const normalizeMediaCodecName = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
  return CODEC_ALIASES[normalized] ?? normalized
}

export const decoderCandidatesForCodec = (codecName: string): readonly string[] =>
  DECODER_CANDIDATES[normalizeMediaCodecName(codecName)] ?? []

export const resolveAvailableDecoder = (
  codecName: string,
  availableDecoders: ReadonlySet<string>,
): string | undefined =>
  decoderCandidatesForCodec(codecName).find((candidate) => availableDecoders.has(candidate))
