import type { ApiSignConfig } from '@renderer/request/api-route-config'
import type { ofetch } from 'ofetch'
import { canonicalString, resetClockOffset, sha256Hex, signCanonical } from '@renderer/request/sign'
import { sendApiRequest } from '@renderer/request/signed-fetch'
import { createFetch } from 'ofetch'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const baseURL = 'https://cf.example.invalid/api/v2'
const sign: ApiSignConfig = { kid: 'w1', key: 'test-secret-w1' }
const NOW = 1_794_045_600_000

interface Captured {
  url: string
  method?: string
  body?: string
  headers: Headers
}

/** 用 ofetch 自身的 createFetch 包一层假 fetch：走真实的 ofetch 序列化与解析流程，只截获网络调用。 */
const capture = (
  respond: (call: Captured, index: number) => Response = () => Response.json({}),
) => {
  const calls: Captured[] = []
  const fetcher = createFetch({
    fetch: async (input, init) => {
      const call: Captured = {
        url: typeof input === 'string' ? input : (input as Request).url,
        method: init?.method,
        body: typeof init?.body === 'string' ? init.body : undefined,
        headers: new Headers(init?.headers),
      }
      calls.push(call)
      return respond(call, calls.length - 1)
    },
  }) as typeof ofetch
  return { calls, fetcher }
}

/** 参考实现：按代理的方式从收到的原始查询串里剔除签名参数并验签。 */
const verifyLikeProxy = async (call: Captured, method: string) => {
  const url = new URL(call.url)
  const rest: string[] = []
  const params: Record<string, string> = {}
  for (const part of url.search.replace(/^\?/, '').split('&')) {
    if (!part) continue
    const [name, ...value] = part.split('=')
    if (['_kid', '_ts', '_nonce', '_sig'].includes(name)) params[name] = value.join('=')
    else rest.push(part)
  }
  const expected = await signCanonical(
    sign.key,
    canonicalString({
      method,
      pathname: url.pathname,
      query: rest.join('&'),
      bodyHash: await sha256Hex(call.body),
      ts: params._ts,
      nonce: params._nonce,
    }),
  )
  return { ok: params._sig === expected, params, query: rest.join('&') }
}

const expiredError = (serverTime: unknown) =>
  Response.json({ error: 'signature_expired', serverTime }, { status: 401 })

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetClockOffset()
})

describe('未配置签名时与原 ofetch 行为一致', () => {
  it('查询参数与 POST 请求体逐字节相同', async () => {
    const legacy = capture()
    const current = capture()
    const query = { anime: '葬送的芙莉莲 / フリーレン & 1', episode: '1', tags: ['a', 'b'] }
    await legacy.fetcher('search/episodes', { baseURL, query, retry: false })
    await sendApiRequest({
      baseURL,
      path: 'search/episodes',
      method: 'GET',
      data: query,
      sign: null,
      fetcher: current.fetcher,
    })
    expect(current.calls[0].url).toBe(new URL(legacy.calls[0].url).toString())

    const body = { fileName: '[Sub] 葬送的芙莉莲 - 01', fileHash: 'a'.repeat(32), fileSize: 1 }
    await legacy.fetcher('/match', { baseURL, method: 'POST', body, retry: false })
    await sendApiRequest({
      baseURL,
      path: '/match',
      method: 'POST',
      data: body,
      sign: null,
      fetcher: current.fetcher,
    })
    expect(current.calls[1].url).toBe(legacy.calls[1].url)
    expect(current.calls[1].body).toBe(legacy.calls[1].body)
    expect(current.calls[1].headers.get('content-type')).toBe('application/json')
  })

  it('不带签名参数，只提示一次', async () => {
    // 提示标记是模块级状态，重新加载模块以免受前面用例影响
    vi.resetModules()
    const { sendApiRequest: fresh } = await import('@renderer/request/signed-fetch')
    const { calls, fetcher } = capture()
    await fresh({ baseURL, path: '/bangumi/shin', method: 'GET', sign: null, fetcher })
    await fresh({ baseURL, path: '/bangumi/shin', method: 'GET', sign: null, fetcher })
    expect(calls[0].url).toBe(`${baseURL}/bangumi/shin`)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })
})

describe('请求签名', () => {
  it('查询参数含中文 / 日文、斜杠、重复参数时可被代理验签，原有参数在前', async () => {
    const { calls, fetcher } = capture()
    const data = { anime: '葬送的芙莉莲 / フリーレン & 1', episode: '1', tags: ['a', 'b'] }
    await sendApiRequest({ baseURL, path: 'search/episodes', method: 'GET', data, sign, fetcher })
    const result = await verifyLikeProxy(calls[0], 'GET')
    expect(result.ok).toBe(true)
    expect(result.params._kid).toBe('w1')
    expect(result.params._ts).toBe(String(NOW / 1000))
    expect(new URL(calls[0].url).search.startsWith(`?${result.query}&_kid=`)).toBe(true)
  })

  it('匹配请求的签名覆盖实际发出的请求体', async () => {
    const { calls, fetcher } = capture()
    const data = { fileName: '[Sub] 葬送的芙莉莲 - 01', fileHash: 'a'.repeat(32), fileSize: 1 }
    await sendApiRequest({ baseURL, path: '/match', method: 'POST', data, sign, fetcher })
    expect(calls[0].body).toBe(JSON.stringify(data))
    expect((await verifyLikeProxy(calls[0], 'POST')).ok).toBe(true)
  })

  it('每次发送使用新的 nonce', async () => {
    const { calls, fetcher } = capture()
    for (let i = 0; i < 2; i++)
      await sendApiRequest({
        baseURL,
        path: '/comment/1',
        method: 'GET',
        data: { withRelated: true },
        sign,
        fetcher,
      })
    const nonces = calls.map((call) => new URL(call.url).searchParams.get('_nonce'))
    expect(nonces[0]).not.toBe(nonces[1])
  })
})

describe('时钟偏差纠正', () => {
  it('signature_expired 时按服务器时间重签重试一次，后续请求沿用偏差', async () => {
    const serverTime = NOW / 1000 + 600
    const { calls, fetcher } = capture((_call, index) =>
      index === 0 ? expiredError(serverTime) : Response.json({ ok: true }),
    )
    const result = await sendApiRequest<{ ok: boolean }>({
      baseURL,
      path: '/bangumi/shin',
      method: 'GET',
      sign,
      fetcher,
    })
    expect(result).toEqual({ ok: true })
    expect(calls).toHaveLength(2)
    const retried = await verifyLikeProxy(calls[1], 'GET')
    expect(retried.ok).toBe(true)
    expect(retried.params._ts).toBe(String(serverTime))

    await sendApiRequest({ baseURL, path: '/bangumi/shin', method: 'GET', sign, fetcher })
    expect(calls).toHaveLength(3)
    expect(new URL(calls[2].url).searchParams.get('_ts')).toBe(String(serverTime))
  })

  it('纠偏后仍失败不再重试', async () => {
    const { calls, fetcher } = capture(() => expiredError(NOW / 1000 + 600))
    await expect(
      sendApiRequest({ baseURL, path: '/bangumi/shin', method: 'GET', sign, fetcher }),
    ).rejects.toMatchObject({ response: { status: 401 } })
    expect(calls).toHaveLength(2)
  })

  it.each(['signature_invalid', 'signature_missing', 'signature_unknown_kid'])(
    '%s 不纠偏、不重试',
    async (error) => {
      const { calls, fetcher } = capture(() =>
        Response.json({ error, serverTime: NOW / 1000 + 600 }, { status: 401 }),
      )
      await expect(
        sendApiRequest({ baseURL, path: '/bangumi/shin', method: 'GET', sign, fetcher }),
      ).rejects.toMatchObject({ response: { status: 401 } })
      expect(calls).toHaveLength(1)
    },
  )

  it('缺少或非法 serverTime 时不重试；未配置签名时也不重试', async () => {
    for (const serverTime of [undefined, 'later', Number.NaN]) {
      const { calls, fetcher } = capture(() => expiredError(serverTime))
      await expect(
        sendApiRequest({ baseURL, path: '/bangumi/shin', method: 'GET', sign, fetcher }),
      ).rejects.toBeTruthy()
      expect(calls).toHaveLength(1)
    }
    const { calls, fetcher } = capture(() => expiredError(NOW / 1000 + 600))
    await expect(
      sendApiRequest({ baseURL, path: '/bangumi/shin', method: 'GET', sign: null, fetcher }),
    ).rejects.toBeTruthy()
    expect(calls).toHaveLength(1)
  })
})
