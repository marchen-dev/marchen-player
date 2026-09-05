import type { HlsTimeline } from '@marchen/shared/media'
import { describe, expect, it } from 'vitest'
import {
  createHlsSegmentDescriptor,
  createClosedGopTimeline,
  createKeyframeAlignedTimeline,
  logicalTimeToSourceTime,
  segmentAtLogicalTime,
  sourceTimeToLogicalTime,
  validateHlsTimeline,
} from './hls-timeline'

const segments = [
  createHlsSegmentDescriptor({
    index: 0,
    startTime: 0,
    duration: 6,
    totalDuration: 14,
    keyframeAligned: true,
    actualFirstPts: -0.128,
  }),
  createHlsSegmentDescriptor({
    index: 1,
    startTime: 6,
    duration: 6,
    totalDuration: 14,
    keyframeAligned: true,
  }),
  createHlsSegmentDescriptor({
    index: 2,
    startTime: 12,
    duration: 2,
    totalDuration: 14,
    keyframeAligned: true,
  }),
]
const timeline: HlsTimeline = {
  schemaVersion: 1,
  sourceStartTime: 5,
  duration: 14,
  targetSegmentDuration: 6,
  mode: 'keyframe-aligned-copy',
  segments,
}

describe('HLS timeline contract', () => {
  it('区分源时间与从零开始的逻辑时间', () => {
    expect(sourceTimeToLogicalTime(12, 5)).toBe(7)
    expect(logicalTimeToSourceTime(7, 5)).toBe(12)
    expect(sourceTimeToLogicalTime(3, 5)).toBe(0)
  })

  it('segment index、计划时间、实际首 PTS 与尾段可同时表达', () => {
    expect(segments[0]).toMatchObject({
      index: 0,
      startTime: 0,
      endTime: 6,
      actualFirstPts: -0.128,
      tail: false,
    })
    expect(segments[2]).toMatchObject({ index: 2, startTime: 12, endTime: 14, tail: true })
    expect(() => validateHlsTimeline(timeline)).not.toThrow()
  })

  it('按逻辑时间定位 segment，duration 末端仍落入尾段', () => {
    expect(segmentAtLogicalTime(timeline, 0)?.index).toBe(0)
    expect(segmentAtLogicalTime(timeline, 6)?.index).toBe(1)
    expect(segmentAtLogicalTime(timeline, 14)?.index).toBe(2)
  })

  it('拒绝不连续、负时长与错误尾段', () => {
    expect(() =>
      validateHlsTimeline({
        ...timeline,
        segments: [{ ...segments[0]!, duration: -1 }],
      }),
    ).toThrow()
    expect(() =>
      validateHlsTimeline({
        ...timeline,
        segments: [segments[0]!, { ...segments[1]!, startTime: 7 }, segments[2]!],
      }),
    ).toThrow('不连续')
  })

  it('按累计目标切点聚合真实关键帧，避免逐段累加偏移', () => {
    const result = createKeyframeAlignedTimeline({
      sourceStartTime: 5,
      duration: 31,
      keyframes: [0, 2, 6.1, 8, 20, 26.2, 30],
      targetSegmentDuration: 6,
    })
    expect(result.segments.map((segment) => segment.startTime)).toEqual([0, 6.1, 20, 26.2, 30])
    expect(result.segments.map((segment) => Number(segment.duration.toFixed(3)))).toEqual([
      6.1, 13.9, 6.2, 3.8, 1,
    ])
    expect(result.segments.at(-1)?.tail).toBe(true)
    expect(result.sourceStartTime).toBe(5)
  })

  it('duration 小于最后关键帧时扩展到可证明的媒体时间', () => {
    const result = createKeyframeAlignedTimeline({
      sourceStartTime: 0,
      duration: 19,
      keyframes: [0, 10, 20],
      targetSegmentDuration: 6,
    })
    expect(result.duration).toBe(20)
    expect(result.segments.map((segment) => segment.duration)).toEqual([10, 10])
  })

  it('缺少逻辑零点关键帧时拒绝生成独立分片声明', () => {
    expect(() =>
      createKeyframeAlignedTimeline({
        sourceStartTime: 0,
        duration: 30,
        keyframes: [5, 10, 20],
        targetSegmentDuration: 6,
      }),
    ).toThrow('零点关键帧')
  })

  it('视频转码按统一 target 生成等长 segment 与尾段', () => {
    const result = createClosedGopTimeline({
      sourceStartTime: 5,
      duration: 14,
      targetSegmentDuration: 6,
    })
    expect(result.mode).toBe('closed-gop-transcode')
    expect(result.segments.map((segment) => segment.duration)).toEqual([6, 6, 2])
    expect(result.segments.map((segment) => segment.startTime)).toEqual([0, 6, 12])
    expect(result.segments.at(-1)?.tail).toBe(true)
  })
})
