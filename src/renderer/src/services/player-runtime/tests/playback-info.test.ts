import { describe, expect, it } from 'vitest'
import { createPlaybackInfoRows } from '../playback-info'

describe('播放信息', () => {
  it.each([0, 23.5, 120])('显示实时解码速率 %s，包含暂停后的零值', (decodeFps) => {
    expect(
      createPlaybackInfoRows({
        engine: 'canvas',
        backend: 'webcodecs',
        firstFrame: true,
        buffering: false,
        width: 1920,
        height: 1080,
        decodeFps,
      }),
    ).toContainEqual({ label: '实时解码 FPS', value: `${decodeFps.toFixed(1)} fps` })
  })
  it.each(['native', 'canvas'] as const)('%s 显示采样帧率并保留三位小数', (engine) => {
    expect(
      createPlaybackInfoRows({
        engine,
        backend: 'native',
        firstFrame: true,
        buffering: false,
        width: 1920,
        height: 1080,
        videoFrameRate: 24000 / 1001,
      }),
    ).toContainEqual({ label: '视频帧率', value: '约 23.976 fps' })
  })
  it('报告实际解码线程，不把 Canvas 笼统标成软件解码', () => {
    const base = {
      engine: 'canvas' as const,
      firstFrame: true,
      buffering: false,
      width: 1920,
      height: 1080,
    }
    expect(createPlaybackInfoRows({ ...base, backend: 'webcodecs' })).toContainEqual({
      label: '视频解码',
      value: 'WebCodecs',
    })
    expect(
      createPlaybackInfoRows({ ...base, backend: 'hevc-wasm', decodeThreads: 4 }),
    ).toContainEqual({ label: '解码线程', value: '4' })
  })
})
