import { describe, expect, it } from 'vitest'
import { normalizeServerUrl } from './provider'

describe('normalizeServerUrl', () => {
  it('没写协议时按 http 补全，包括 IP、主机名加端口', () => {
    expect(normalizeServerUrl('192.168.5.3:8096', false).href).toBe('http://192.168.5.3:8096/')
    expect(normalizeServerUrl(' nas.local:8096 ', false).href).toBe('http://nas.local:8096/')
    expect(normalizeServerUrl('localhost:5244/dav', true).href).toBe('http://localhost:5244/dav/')
  })

  it('写了协议时保持原样', () => {
    expect(normalizeServerUrl('https://jf.example.com/', false).href).toBe(
      'https://jf.example.com/',
    )
    expect(normalizeServerUrl('HTTP://192.168.5.3:8096', false).href).toBe(
      'http://192.168.5.3:8096/',
    )
  })

  it('拒绝非 HTTP(S) 协议、带账号密码的地址和无效输入', () => {
    expect(() => normalizeServerUrl('ftp://nas.local', false)).toThrow(
      expect.objectContaining({ code: 'invalid_input' }),
    )
    expect(() => normalizeServerUrl('me:pw@nas.local', false)).toThrow(
      expect.objectContaining({ code: 'invalid_input' }),
    )
    expect(() => normalizeServerUrl('', false)).toThrow(
      expect.objectContaining({ code: 'invalid_input' }),
    )
  })
})
