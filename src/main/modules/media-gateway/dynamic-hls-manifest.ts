import type { HlsTimeline } from '@marchen/shared/media'
import { validateHlsTimeline } from './hls-timeline'

const formatDuration = (value: number): string => value.toFixed(6)

export const createDynamicHlsManifest = (timeline: HlsTimeline): string => {
  validateHlsTimeline(timeline)
  const targetDuration = Math.max(
    1,
    Math.ceil(Math.max(...timeline.segments.map((item) => item.duration))),
  )
  return [
    '#EXTM3U',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-VERSION:7',
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-INDEPENDENT-SEGMENTS',
    '#EXT-X-MAP:URI="init.mp4"',
    ...timeline.segments.flatMap((segment) => [
      `#EXTINF:${formatDuration(segment.duration)},`,
      `segments/${segment.index}.m4s`,
    ]),
    '#EXT-X-ENDLIST',
    '',
  ].join('\n')
}
