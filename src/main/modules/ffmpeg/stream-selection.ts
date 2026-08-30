import type { MediaProbeResult, MediaStream } from '@marchen/shared/media'

export interface PrimaryStreamSelectionOptions {
  preferredAudioLanguages?: readonly string[]
  preferredVideoLanguages?: readonly string[]
}

const LANGUAGE_ALIASES: Record<string, string> = {
  chi: 'zh',
  zho: 'zh',
  jpn: 'ja',
  eng: 'en',
}

const normalizeLanguage = (value?: string) => {
  const language = value?.trim().toLowerCase() ?? 'und'
  return LANGUAGE_ALIASES[language] ?? language
}

const select = (
  streams: readonly MediaStream[],
  preferredLanguages: readonly string[],
): MediaStream | undefined => {
  const preferences = preferredLanguages.map(normalizeLanguage)
  return [...streams].sort((left, right) => {
    if (left.disposition.default !== right.disposition.default) {
      return left.disposition.default ? -1 : 1
    }
    const leftRank = preferences.indexOf(normalizeLanguage(left.tags.language))
    const rightRank = preferences.indexOf(normalizeLanguage(right.tags.language))
    const normalizedLeftRank = leftRank < 0 ? Number.MAX_SAFE_INTEGER : leftRank
    const normalizedRightRank = rightRank < 0 ? Number.MAX_SAFE_INTEGER : rightRank
    return normalizedLeftRank - normalizedRightRank || left.index - right.index
  })[0]
}

export const selectPrimaryMediaStreams = (
  probe: MediaProbeResult,
  options: PrimaryStreamSelectionOptions = {},
): MediaProbeResult => {
  const videos = probe.streams.filter(
    (stream) => stream.type === 'video' && !stream.disposition.attachedPicture,
  )
  const audios = probe.streams.filter((stream) => stream.type === 'audio')
  const video = select(videos, options.preferredVideoLanguages ?? [])
  const audio = select(audios, options.preferredAudioLanguages ?? ['ja', 'zh', 'en', 'und'])
  return {
    ...probe,
    primaryVideoStreamIndex: video?.index,
    primaryAudioStreamIndex: audio?.index,
  }
}

/** FFmpeg preset 使用全局 stream index，永不依赖自动选流。 */
export const explicitPrimaryMapArguments = (probe: MediaProbeResult): string[] => {
  if (probe.primaryVideoStreamIndex === undefined) throw new Error('媒体缺少可用主视频轨道')
  const arguments_ = ['-map', `0:${probe.primaryVideoStreamIndex}`]
  if (probe.primaryAudioStreamIndex !== undefined) {
    arguments_.push('-map', `0:${probe.primaryAudioStreamIndex}`)
  }
  return arguments_
}
