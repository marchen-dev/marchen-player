import { describe, expect, it } from 'vitest'
import { createDynamicHlsManifest } from './dynamic-hls-manifest'
import { createClosedGopTimeline, createKeyframeAlignedTimeline } from './hls-timeline'

describe('Dynamic HLS VOD manifest', () => {
  it('转码 timeline 生成稳定 init/segment endpoint 与 ENDLIST', () => {
    const manifest = createDynamicHlsManifest(
      createClosedGopTimeline({ sourceStartTime: 5, duration: 14, targetSegmentDuration: 6 }),
    )
    expect(manifest).toContain('#EXT-X-PLAYLIST-TYPE:VOD')
    expect(manifest).toContain('#EXT-X-TARGETDURATION:6')
    expect(manifest).toContain('#EXT-X-MAP:URI="init.mp4"')
    expect(manifest).toContain('#EXTINF:6.000000,\nsegments/0.m4s')
    expect(manifest).toContain('#EXTINF:2.000000,\nsegments/2.m4s')
    expect(manifest.trimEnd().endsWith('#EXT-X-ENDLIST')).toBe(true)
  })

  it('视频 copy 使用真实最大关键帧 segment 计算 TARGETDURATION', () => {
    const manifest = createDynamicHlsManifest(
      createKeyframeAlignedTimeline({
        sourceStartTime: 0,
        duration: 31,
        targetSegmentDuration: 6,
        keyframes: [0, 6.1, 20, 26.2],
      }),
    )
    expect(manifest).toContain('#EXT-X-TARGETDURATION:14')
    expect(manifest).toContain('#EXTINF:13.900000,\nsegments/1.m4s')
  })
})
