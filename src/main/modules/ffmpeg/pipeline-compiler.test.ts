import type { PlaybackDecision } from '@marchen/shared/media'
import { describe, expect, it } from 'vitest'
import {
  createVideoCompatibilityFilter,
  createRemuxHlsPreset,
  createTranscodeAudioHlsPreset,
  createTranscodeVideoHlsPreset,
} from './hls-preset'
import { compilePlaybackDecision } from './pipeline-compiler'

const shared = {
  trial: false,
  subtitle: { action: 'external-render' as const },
  reasons: [],
}

describe('正交 PlaybackDecision compiler', () => {
  it('Direct Play 不生成 FFmpeg 操作', () => {
    const decision: PlaybackDecision = {
      ...shared,
      method: 'direct-play',
      container: { action: 'direct' },
      video: { action: 'direct', streamIndex: 0, sourceCodec: 'h264' },
      audio: { action: 'direct', streamIndex: 1, sourceCodec: 'aac' },
    }
    expect(compilePlaybackDecision(decision)).toEqual({ kind: 'direct' })
  })

  it('视频/音频 copy 编译为 remux', () => {
    const decision: PlaybackDecision = {
      ...shared,
      method: 'direct-stream',
      container: { action: 'remux', target: 'fmp4-hls' },
      video: { action: 'copy', streamIndex: 2, sourceCodec: 'hevc' },
      audio: { action: 'copy', streamIndex: 4, sourceCodec: 'aac' },
    }
    expect(compilePlaybackDecision(decision)).toEqual({
      kind: 'remux',
      plan: {
        kind: 'remux',
        reason: 'container-incompatible',
        videoStreamIndex: 2,
        audioStreamIndex: 4,
        video: 'copy',
        audio: 'copy',
      },
    })
  })

  it('视频 copy/音频 AAC 编译为 audio-compatible', () => {
    const decision: PlaybackDecision = {
      ...shared,
      method: 'direct-stream',
      container: { action: 'remux', target: 'fmp4-hls' },
      video: { action: 'copy', streamIndex: 0, sourceCodec: 'hevc' },
      audio: {
        action: 'transcode',
        streamIndex: 1,
        sourceCodec: 'eac3',
        targetCodec: 'aac',
        profile: 'aac-low-complexity',
        sampleRate: 48_000,
        channels: 2,
      },
    }
    expect(compilePlaybackDecision(decision)).toMatchObject({
      kind: 'audio-compatible',
      plan: {
        kind: 'transcode-audio',
        video: 'copy',
        audio: { codec: 'aac', profile: 'aac_low', sampleRate: 48_000, channels: 2 },
      },
    })
  })

  it.each([
    ['none', 'video-compatible', false],
    ['hdr-to-sdr', 'hdr-compatible', true],
  ] as const)('视频 toneMap=%s 编译为 %s', (toneMap, kind, toneMapToSdr) => {
    const decision: PlaybackDecision = {
      ...shared,
      method: 'transcode',
      container: { action: 'remux', target: 'fmp4-hls' },
      video: {
        action: 'transcode',
        streamIndex: 0,
        sourceCodec: 'av1',
        targetCodec: 'h264',
        pixelFormat: 'yuv420p',
        toneMap,
      },
      audio: { action: 'copy', streamIndex: 1, sourceCodec: 'aac' },
    }
    expect(compilePlaybackDecision(decision)).toMatchObject({
      kind,
      plan: {
        kind: 'transcode-video',
        video: { codec: 'h264', toneMapToSdr },
        audio: 'copy',
      },
    })
  })

  it('remux/audio/video 操作都只 map 决策指定的主轨道', () => {
    const remux = compilePlaybackDecision({
      ...shared,
      method: 'direct-stream',
      container: { action: 'remux', target: 'fmp4-hls' },
      // 0 是 attached picture、7 是评论音轨；决策只选择正片 3 与主音轨 8。
      video: { action: 'copy', streamIndex: 3, sourceCodec: 'hevc' },
      audio: { action: 'copy', streamIndex: 8, sourceCodec: 'aac' },
    })
    expect(remux.kind).toBe('remux')
    if (remux.kind !== 'remux') return
    const remuxArgs = createRemuxHlsPreset({
      inputPath: '/video/multi.mkv',
      outputDirectory: '/cache/remux',
      plan: remux.plan,
    }).arguments
    expect(
      remuxArgs.flatMap((value, index) => (value === '-map' ? [remuxArgs[index + 1]] : [])),
    ).toEqual(['0:3', '0:8'])

    const audio = compilePlaybackDecision({
      ...shared,
      method: 'direct-stream',
      container: { action: 'remux', target: 'fmp4-hls' },
      video: { action: 'copy', streamIndex: 3, sourceCodec: 'hevc' },
      audio: {
        action: 'transcode',
        streamIndex: 8,
        sourceCodec: 'eac3',
        targetCodec: 'aac',
        profile: 'aac-low-complexity',
        sampleRate: 48_000,
        channels: 2,
      },
    })
    expect(audio.kind).toBe('audio-compatible')
    if (audio.kind !== 'audio-compatible') return
    const audioArgs = createTranscodeAudioHlsPreset({
      inputPath: '/video/multi.mkv',
      outputDirectory: '/cache/audio',
      plan: audio.plan,
    }).arguments
    expect(
      audioArgs.flatMap((value, index) => (value === '-map' ? [audioArgs[index + 1]] : [])),
    ).toEqual(['0:3', '0:8'])

    const video = compilePlaybackDecision({
      ...shared,
      method: 'transcode',
      container: { action: 'remux', target: 'fmp4-hls' },
      video: {
        action: 'transcode',
        streamIndex: 3,
        sourceCodec: 'vp9',
        targetCodec: 'h264',
        pixelFormat: 'yuv420p',
        toneMap: 'none',
      },
    })
    expect(video.kind).toBe('video-compatible')
    if (video.kind !== 'video-compatible') return
    const videoArgs = createTranscodeVideoHlsPreset({
      inputPath: '/video/no-audio.mkv',
      outputDirectory: '/cache/video',
      plan: video.plan,
      encoder: 'libx264',
    }).arguments
    expect(
      videoArgs.flatMap((value, index) => (value === '-map' ? [videoArgs[index + 1]] : [])),
    ).toEqual(['0:3'])
    expect(videoArgs).toContain('-an')
  })

  it('HEVC copy 在 remux 与音频兼容操作中规范 hvc1/extradata，其他 codec 不添加', () => {
    const sourceVideo = {
      index: 0,
      type: 'video' as const,
      codecName: 'hevc',
      width: 1920,
      height: 1080,
      dynamicRange: 'sdr' as const,
      disposition: { default: true, forced: false, attachedPicture: false },
      tags: {},
    }
    const remux = compilePlaybackDecision({
      ...shared,
      method: 'direct-stream',
      container: { action: 'remux', target: 'fmp4-hls' },
      video: { action: 'copy', streamIndex: 0, sourceCodec: 'hevc' },
      audio: { action: 'copy', streamIndex: 1, sourceCodec: 'aac' },
    })
    if (remux.kind !== 'remux') throw new Error('expected remux')
    const remuxArgs = createRemuxHlsPreset({
      inputPath: '/video/hevc.mkv',
      outputDirectory: '/cache/remux',
      plan: remux.plan,
      sourceVideo,
    }).arguments
    expect(remuxArgs).toEqual(
      expect.arrayContaining([
        '-c:v',
        'copy',
        '-bsf:v',
        'hevc_mp4toannexb,extract_extradata',
        '-tag:v',
        'hvc1',
        '-c:a',
        'copy',
      ]),
    )

    const audio = compilePlaybackDecision({
      ...shared,
      method: 'direct-stream',
      container: { action: 'remux', target: 'fmp4-hls' },
      video: { action: 'copy', streamIndex: 0, sourceCodec: 'hevc' },
      audio: {
        action: 'transcode',
        streamIndex: 1,
        sourceCodec: 'eac3',
        targetCodec: 'aac',
        profile: 'aac-low-complexity',
        sampleRate: 48_000,
        channels: 2,
      },
    })
    if (audio.kind !== 'audio-compatible') throw new Error('expected audio-compatible')
    const audioArgs = createTranscodeAudioHlsPreset({
      inputPath: '/video/hevc.mkv',
      outputDirectory: '/cache/audio',
      plan: audio.plan,
      sourceVideo,
    }).arguments
    expect(audioArgs).toEqual(
      expect.arrayContaining([
        '-c:v',
        'copy',
        '-bsf:v',
        'hevc_mp4toannexb,extract_extradata',
        '-tag:v',
        'hvc1',
        '-c:a',
        'aac',
      ]),
    )

    const h264Args = createRemuxHlsPreset({
      inputPath: '/video/h264.mkv',
      outputDirectory: '/cache/h264',
      plan: remux.plan,
      sourceVideo: { ...sourceVideo, codecName: 'h264' },
    }).arguments
    expect(h264Args).not.toContain('hevc_mp4toannexb,extract_extradata')
    expect(h264Args).not.toContain('hvc1')
  })

  it.each(['hevc', 'av1', 'vp9', 'vc1', 'mpeg2video'])(
    '%s 使用同一 H.264/yuv420p 输出管线',
    (codec) => {
      const compiled = compilePlaybackDecision({
        ...shared,
        method: 'transcode',
        container: { action: 'remux', target: 'fmp4-hls' },
        video: {
          action: 'transcode',
          streamIndex: 0,
          sourceCodec: codec,
          targetCodec: 'h264',
          pixelFormat: 'yuv420p',
          toneMap: 'none',
        },
        audio: { action: 'copy', streamIndex: 1, sourceCodec: 'aac' },
      })
      if (compiled.kind !== 'video-compatible') throw new Error('expected video-compatible')
      const arguments_ = createTranscodeVideoHlsPreset({
        inputPath: `/video/${codec}.mkv`,
        outputDirectory: `/cache/${codec}`,
        plan: compiled.plan,
        encoder: 'libx264',
      }).arguments

      expect(arguments_).toEqual(
        expect.arrayContaining(['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'copy']),
      )
    },
  )

  it('视频转码与音频 AAC 组合仍只使用固定兼容输出', () => {
    const compiled = compilePlaybackDecision({
      ...shared,
      method: 'transcode',
      container: { action: 'remux', target: 'fmp4-hls' },
      video: {
        action: 'transcode',
        streamIndex: 0,
        sourceCodec: 'vc1',
        targetCodec: 'h264',
        pixelFormat: 'yuv420p',
        toneMap: 'none',
      },
      audio: {
        action: 'transcode',
        streamIndex: 1,
        sourceCodec: 'flac',
        targetCodec: 'aac',
        profile: 'aac-low-complexity',
        sampleRate: 48_000,
        channels: 2,
      },
    })
    if (compiled.kind !== 'video-compatible') throw new Error('expected video-compatible')
    const arguments_ = createTranscodeVideoHlsPreset({
      inputPath: '/video/vc1-flac.mkv',
      outputDirectory: '/cache/vc1-flac',
      plan: compiled.plan,
      encoder: 'libx264',
    }).arguments
    expect(arguments_).toEqual(
      expect.arrayContaining([
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-profile:a',
        'aac_low',
      ]),
    )
  })

  it('新 decision 保留 HDR/SDR、旋转和宽高比处理边界', () => {
    const hdr = compilePlaybackDecision({
      ...shared,
      method: 'transcode',
      container: { action: 'remux', target: 'fmp4-hls' },
      video: {
        action: 'transcode',
        streamIndex: 0,
        sourceCodec: 'hevc',
        targetCodec: 'h264',
        pixelFormat: 'yuv420p',
        toneMap: 'hdr-to-sdr',
      },
    })
    if (hdr.kind !== 'hdr-compatible') throw new Error('expected hdr-compatible')
    const hdrFilter = createVideoCompatibilityFilter(hdr.plan, {
      index: 0,
      type: 'video',
      codecName: 'hevc',
      width: 1080,
      height: 1920,
      bitDepth: 10,
      dynamicRange: 'hdr10',
      rotation: 90,
      sampleAspectRatio: '4:3',
      displayAspectRatio: '16:9',
      disposition: { default: true, forced: false, attachedPicture: false },
      tags: {},
    })
    expect(hdrFilter).toContain('tonemap=tonemap=hable')
    expect(hdrFilter).toContain('format=yuv420p')
    expect(hdrFilter).toContain('setsar=3/4')
    expect(hdrFilter).toContain('setdar=9/16')

    const sdr = compilePlaybackDecision({
      ...shared,
      method: 'transcode',
      container: { action: 'remux', target: 'fmp4-hls' },
      video: {
        action: 'transcode',
        streamIndex: 0,
        sourceCodec: 'hevc',
        targetCodec: 'h264',
        pixelFormat: 'yuv420p',
        toneMap: 'none',
      },
    })
    if (sdr.kind !== 'video-compatible') throw new Error('expected video-compatible')
    const sdrPreset = createTranscodeVideoHlsPreset({
      inputPath: '/video/main10-sdr.mkv',
      outputDirectory: '/cache/main10-sdr',
      encoder: 'libx264',
      plan: sdr.plan,
      sourceVideo: {
        index: 0,
        type: 'video',
        codecName: 'hevc',
        width: 1920,
        height: 1080,
        bitDepth: 10,
        dynamicRange: 'sdr',
        colorPrimaries: 'bt709',
        colorTransfer: 'bt709',
        colorSpace: 'bt709',
        colorRange: 'tv',
        disposition: { default: true, forced: false, attachedPicture: false },
        tags: {},
      },
    })
    expect(sdrPreset.arguments).not.toContain('tonemap=tonemap=hable')
    expect(sdrPreset.arguments).toEqual(
      expect.arrayContaining([
        '-pix_fmt',
        'yuv420p',
        '-color_primaries',
        'bt709',
        '-color_trc',
        'bt709',
      ]),
    )
    expect(sdrPreset.arguments).toEqual(
      expect.arrayContaining(['-autorotate', '-metadata:s:v:0', 'rotate=0']),
    )
  })
})
