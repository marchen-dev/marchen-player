import {
  canonicalString,
  createNonce,
  getClockOffset,
  resetClockOffset,
  sha256Hex,
  signCanonical,
  signingTimestamp,
  signRequestUrl,
  updateClockOffset,
} from '@renderer/request/sign'
import { afterEach, describe, expect, it } from 'vitest'
// 复制自 dandan-proxy 仓库 tests/fixtures/sign-vectors.json，是代理与客户端共用的签名契约；
// 代理侧修改签名规范时必须同步更新这份文件。
import vectors from './fixtures/dandan-proxy-sign-vectors.json'

afterEach(() => resetClockOffset())

describe('请求签名与代理测试向量一致', () => {
  it.each(vectors.cases)('$name', async (item) => {
    expect(await sha256Hex(item.body)).toBe(item.bodyHash)
    expect(canonicalString(item)).toBe(item.canonical)
    expect(await signCanonical(vectors.secret, item.canonical)).toBe(item.sig)
  })

  it('对已解析的地址签名时得到与向量相同的签名', async () => {
    for (const item of vectors.cases) {
      const url = new URL(
        `https://proxy.example${item.pathname}${item.query ? `?${item.query}` : ''}`,
      )
      const signed = await signRequestUrl(
        { kid: vectors.kid, key: vectors.secret },
        item.method,
        url,
        item.body || undefined,
        Number(item.ts) * 1000,
      )
      const params = new URLSearchParams(signed.search)
      expect(params.get('_kid')).toBe(vectors.kid)
      expect(params.get('_ts')).toBe(item.ts)
      // nonce 随机生成，按实际 nonce 重新计算期望签名
      const nonce = params.get('_nonce')!
      const expected = await signCanonical(vectors.secret, canonicalString({ ...item, nonce }))
      expect(params.get('_sig')).toBe(expected)
      // 原有参数保持在前且原样不变
      expect(signed.search.startsWith(item.query ? `?${item.query}&_kid=` : '?_kid=')).toBe(true)
    }
  })
})

describe('签名辅助', () => {
  it('nonce 为 22 位 base64url 且每次不同', () => {
    const a = createNonce()
    expect(a).toMatch(/^[\w-]{22}$/)
    expect(createNonce()).not.toBe(a)
  })

  it('时钟偏差按服务器时间修正并用于后续时间戳', () => {
    const now = 1_794_045_600_000
    expect(signingTimestamp(now)).toBe('1794045600')
    updateClockOffset(1_794_046_200, now)
    expect(getClockOffset()).toBe(600)
    expect(signingTimestamp(now)).toBe('1794046200')
  })
})
