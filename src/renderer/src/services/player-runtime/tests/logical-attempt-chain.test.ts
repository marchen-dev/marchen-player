import { describe, expect, it } from 'vitest'
import { LogicalPlaybackAttemptChain, playbackMethodForMode } from '../logical-attempt-chain'

describe('LogicalPlaybackAttemptChain', () => {
  it('支持 Direct Play trial 经 Direct Stream 到 Full Transcode', () => {
    const chain = new LogicalPlaybackAttemptChain('direct-play')
    expect(chain.advance('direct-stream')).toEqual(['direct-play', 'direct-stream'])
    expect(chain.advance('transcode')).toEqual(['direct-play', 'direct-stream', 'transcode'])
  })

  it('允许明确不支持时直接从 Direct Play 进入 Full Transcode', () => {
    const chain = new LogicalPlaybackAttemptChain('direct-play')
    expect(chain.advance('transcode')).toEqual(['direct-play', 'transcode'])
    expect(() => chain.advance('direct-stream')).toThrow('不能从 transcode 回退')
  })

  it('可以 Full Transcode 作为首次明确决策，且拒绝非单向旧链', () => {
    expect(new LogicalPlaybackAttemptChain('transcode').methods).toEqual(['transcode'])
    expect(() => new LogicalPlaybackAttemptChain(['direct-stream', 'direct-play'])).toThrow('单向')
  })

  it('旧 PlaybackMode 只在迁移边界映射到 logical method', () => {
    expect(playbackMethodForMode('direct')).toBe('direct-play')
    expect(playbackMethodForMode('remux')).toBe('direct-stream')
    expect(playbackMethodForMode('transcode-audio')).toBe('direct-stream')
    expect(playbackMethodForMode('transcode-video')).toBe('transcode')
  })
})
