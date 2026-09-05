import type { PlaybackDecision } from '@marchen/shared/media'
import { describe, expect, it } from 'vitest'
import { compilePlaybackDecision } from '../ffmpeg/pipeline-compiler'
import { createClosedGopTimeline } from './hls-timeline'
import { compileDynamicHlsJob, validateDynamicJobCoverage } from './dynamic-hls-job-compiler'

const timeline = createClosedGopTimeline({
  sourceStartTime: 0,
  duration: 30,
  targetSegmentDuration: 2,
})
const decision: PlaybackDecision = {
  method: 'transcode',
  trial: false,
  container: { action: 'remux', target: 'fmp4-hls' },
  video: {
    action: 'transcode',
    streamIndex: 0,
    sourceCodec: 'hevc',
    targetCodec: 'h264',
    pixelFormat: 'yuv420p',
    toneMap: 'none',
  },
  subtitle: { action: 'external-render' },
  reasons: [],
}

describe('Dynamic HLS Job compiler', () => {
  it('segment index 同时决定 seek、start_number 与预期文件名', () => {
    const pipeline = compilePlaybackDecision(decision)
    if (pipeline.kind === 'direct') throw new Error('expected media pipeline')
    const job = compileDynamicHlsJob({
      pipeline,
      timeline,
      segmentIndex: 7,
      inputPath: '/video/hevc.mkv',
      outputDirectory: '/cache/job-1',
      videoEncoder: 'libx264',
      decoder: {
        name: 'hevc',
        class: 'software',
        inputArguments: ['-hwaccel', 'none', '-c:v', 'hevc'],
      },
    })
    expect(job).toMatchObject({
      requestedSegmentIndex: 7,
      requestedLogicalTime: 14,
      expectedSegmentName: 'segment-00007.m4s',
    })
    expect(job.preset.arguments).toEqual(
      expect.arrayContaining([
        '-ss',
        '14',
        '-start_number',
        '7',
        '-hls_time',
        '2',
        '-hwaccel',
        'none',
      ]),
    )
  })

  it('首 PTS 与产出 index 必须覆盖请求目标', () => {
    expect(() =>
      validateDynamicJobCoverage({
        timeline,
        requestedSegmentIndex: 7,
        actualFirstPts: 13.9,
        producedSegmentIndices: [7, 8],
      }),
    ).not.toThrow()
    expect(() =>
      validateDynamicJobCoverage({
        timeline,
        requestedSegmentIndex: 7,
        actualFirstPts: 14,
        producedSegmentIndices: [8],
      }),
    ).toThrow('没有产出')
    expect(() =>
      validateDynamicJobCoverage({
        timeline,
        requestedSegmentIndex: 7,
        actualFirstPts: 2,
        producedSegmentIndices: [7],
      }),
    ).toThrow('首 PTS')
  })
})
