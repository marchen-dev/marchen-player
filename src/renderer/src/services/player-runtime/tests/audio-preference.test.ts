import { describe, expect, it } from 'vitest'
import { restoreAudioPreference } from '../audio-preference'

const primary = { id: 2, label: '日语', language: 'jpn', codec: 'eac3', channels: 6, default: true }
const alternate = { ...primary, id: 3, label: '英语', language: 'eng', default: false }
describe('稳定音轨偏好', () => {
  it('重新核对描述，不把复用的编号当作旧音轨', () => {
    expect(restoreAudioPreference([primary, alternate], alternate)).toBe(3)
    expect(restoreAudioPreference([primary, { ...alternate, id: 8 }], alternate)).toBe(8)
    expect(restoreAudioPreference([primary, { ...alternate, language: 'fra' }], alternate)).toBe(2)
  })
  it('描述有歧义且原编号消失时使用显式默认', () => {
    expect(
      restoreAudioPreference(
        [primary, { ...alternate, id: 8 }, { ...alternate, id: 9 }],
        alternate,
        2,
      ),
    ).toBe(2)
  })
})
