import { describe, expect, it } from 'vitest'
import {
  createInitFingerprintFromProbe,
  InitFingerprintGuard,
  InitFingerprintMismatchError,
} from './init-fingerprint'

const probe = (extradata: string) => ({
  streams: [
    {
      index: 0,
      id: '0x1',
      codec_name: 'hevc',
      codec_tag_string: 'hvc1',
      profile: 'Main 10',
      level: 120,
      time_base: '1/16000',
      extradata,
      extradata_size: 4,
    },
  ],
})

describe('init fingerprint guard', () => {
  it('忽略 hex dump 地址/空白，只比较解码相关字节', () => {
    expect(createInitFingerprintFromProbe(probe('00000000: 0102 0304'))).toEqual(
      createInitFingerprintFromProbe(probe('00000010: 01020304')),
    )
  })

  it('首次固定基线，相同轨道 fingerprint 接受且返回防修改副本', () => {
    const guard = new InitFingerprintGuard()
    const fingerprint = createInitFingerprintFromProbe(probe('00000000: 0102 0304'))
    guard.accept(fingerprint)
    expect(() => guard.accept(fingerprint)).not.toThrow()
    const snapshot = guard.expected!
    snapshot.tracks[0]!.codec = 'mutated'
    expect(guard.expected?.tracks[0]?.codec).toBe('hevc')
  })

  it('extradata/track 配置变化时拒绝混入', () => {
    const guard = new InitFingerprintGuard()
    guard.accept(createInitFingerprintFromProbe(probe('00000000: 0102 0304')))
    expect(() =>
      guard.accept(createInitFingerprintFromProbe(probe('00000000: 0102 0305'))),
    ).toThrow(InitFingerprintMismatchError)
  })
})
