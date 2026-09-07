import type { PlaybackResource } from '../platform/media-resource'
import { describe, expect, it, vi } from 'vitest'
import { choosePlaybackEngine } from '../engine-policy'

function resource(primaryCodec: string | null = 'mp4a.40.2') {
  return {
    metadata: {
      describe: async () => ({
        tracks: [
          { id: 1, config: { codec: 'avc1.640028' } },
          { id: 2, config: primaryCodec ? { codec: primaryCodec } : null },
          { id: 3, config: { codec: 'ec-3' } },
        ],
      }),
    },
    input: {
      getFormat: async () => ({ mimeType: 'video/mp4' }),
      getPrimaryVideoTrack: async () => ({ id: 1 }),
      getPrimaryAudioTrack: async () => ({ id: 2 }),
    },
  } as unknown as PlaybackResource
}

describe('实际选中轨道的内核选择', () => {
  it('未选中的 E-AC-3 音轨不影响原生 AAC 播放', async () => {
    const probe = vi.fn(() => 'probably' as const)
    expect(await choosePlaybackEngine('auto', resource(), probe)).toBe('native')
    expect(probe).toHaveBeenCalledWith('video/mp4; codecs="avc1.640028,mp4a.40.2"')
  })
  it('已知不支持才直接使用 Canvas，未知编码保留实际尝试', async () => {
    const probe = vi.fn(() => '' as const)
    expect(await choosePlaybackEngine('auto', resource(), probe)).toBe('canvas')
    probe.mockClear()
    expect(await choosePlaybackEngine('auto', resource(null), probe)).toBe('native')
    expect(probe).not.toHaveBeenCalled()
  })
  it('自动模式保留备用音轨，固定内核遵从明确选择', async () => {
    const probe = vi.fn(() => 'probably' as const)
    expect(await choosePlaybackEngine('auto', resource(), probe, 3)).toBe('canvas')
    expect(await choosePlaybackEngine('native', resource(), probe, 3)).toBe('native')
    expect(await choosePlaybackEngine('canvas', resource(), probe)).toBe('canvas')
    expect(probe).not.toHaveBeenCalled()
  })
})
