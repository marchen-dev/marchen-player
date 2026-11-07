import type { QueryObject } from 'ufo'
/**
 * 发往弹弹play 代理的单次线路尝试：构造最终地址与请求体，签名后发送。
 *
 * ofetch 在 onRequest 钩子之后才拼接 baseURL / query 并序列化 JSON，钩子里拿不到最终字节，
 * 所以这里用与 ofetch 内部相同的 ufo `withBase` / `withQuery` 先拼好地址、自行序列化请求体，
 * 再把完整地址交给 ofetch，保证签名内容与实际发出的内容完全一致。
 */
import type { ApiSignConfig } from './api-route-config'
import { ofetch } from 'ofetch'
import { withBase, withQuery } from 'ufo'
import { signRequestUrl, updateClockOffset } from './sign'

export interface SendApiRequestOptions {
  baseURL: string
  path: string
  method: 'GET' | 'POST' | 'DELETE'
  data?: object
  sign: ApiSignConfig | null
  signal?: AbortSignal
  /** 测试注入；默认 ofetch */
  fetcher?: typeof ofetch
}

let warnedUnsigned = false

/** 代理以 401 拒绝过期签名时会附带服务器时间（秒），用于纠正本地时钟。 */
const expiredServerTime = (error: unknown) => {
  const { response, data } = (error ?? {}) as {
    response?: { status?: number }
    data?: { error?: unknown; serverTime?: unknown }
  }
  if (response?.status !== 401 || data?.error !== 'signature_expired') return null
  return typeof data.serverTime === 'number' && Number.isFinite(data.serverTime)
    ? data.serverTime
    : null
}

export const sendApiRequest = async <T>({
  baseURL,
  path,
  method,
  data,
  sign,
  signal,
  fetcher = ofetch,
}: SendApiRequestOptions): Promise<T> => {
  const base = withBase(path, baseURL)
  const target = new URL(method === 'POST' || !data ? base : withQuery(base, data as QueryObject))
  // JSON 只序列化一次：签名哈希与实际请求体是同一串字节。
  const body = method === 'POST' && data !== undefined ? JSON.stringify(data) : undefined
  const headers =
    body === undefined
      ? undefined
      : { 'Content-Type': 'application/json', Accept: 'application/json' }

  if (!sign && !warnedUnsigned) {
    warnedUnsigned = true
    console.warn('未配置 VITE_API_SIGN_KID / VITE_API_SIGN_KEY，API 请求不签名')
  }

  // 每次发送都重新签名，时间戳与 nonce 都是新的；签名与代理域名无关，主备线路通用。
  const send = async () => {
    const url = sign ? await signRequestUrl(sign, method, target, body) : target
    return fetcher<T>(url.toString(), { method, body, headers, signal, retry: false })
  }

  try {
    return await send()
  } catch (error) {
    // 本地时钟偏差过大：按服务器时间纠偏后重签重试一次。401 不会触发线路切换。
    const serverTime = sign ? expiredServerTime(error) : null
    if (serverTime === null) throw error
    updateClockOffset(serverTime)
    return send()
  }
}
