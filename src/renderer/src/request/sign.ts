/**
 * 弹弹play 代理请求签名（v1），与 dandan-proxy `src/sign.js` 保持同一规范：
 *
 *   v1 \n METHOD \n pathname \n 去掉签名参数后的原始查询串 \n 请求体 SHA-256 hex \n _ts \n _nonce
 *
 * 用 HMAC-SHA256 计算，base64url 无填充编码，签名参数 `_kid`、`_ts`、`_nonce`、`_sig` 追加在查询串末尾。
 * 签名放在查询串而不是请求头，GET 仍是简单请求，不会因签名多出 CORS 预检。
 *
 * 密钥随客户端分发，签名只用于提高调用门槛、按 kid 轮换和区分流量来源，不是身份认证。
 */
import type { ApiSignConfig } from './api-route-config'

const encoder = new TextEncoder()
const keyCache = new Map<string, Promise<CryptoKey>>()

/** 本地时钟与代理服务器的偏差（秒），只在内存中保存，刷新或重启后重新学习。 */
let clockOffsetSeconds = 0

export const getClockOffset = () => clockOffsetSeconds

/** 代理返回 `signature_expired` 时按服务器时间修正偏差，之后的签名沿用。 */
export const updateClockOffset = (serverTimeSeconds: number, nowMs = Date.now()) => {
  clockOffsetSeconds = Math.round(serverTimeSeconds - nowMs / 1000)
}

/** 仅供测试重置会话状态。 */
export const resetClockOffset = () => {
  clockOffsetSeconds = 0
}

export const signingTimestamp = (nowMs = Date.now()) =>
  String(Math.floor(nowMs / 1000) + clockOffsetSeconds)

export interface CanonicalInput {
  method: string
  pathname: string
  /** 不含开头 `?` 的原始查询串，不含签名参数 */
  query: string
  bodyHash: string
  ts: string
  nonce: string
}

export const canonicalString = ({ method, pathname, query, bodyHash, ts, nonce }: CanonicalInput) =>
  ['v1', method, pathname, query, bodyHash, ts, nonce].join('\n')

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')

const toBase64Url = (buffer: ArrayBuffer | Uint8Array) => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/** 请求体 SHA-256；无请求体时为空串的哈希，与代理一致。 */
export const sha256Hex = async (body = '') =>
  toHex(await crypto.subtle.digest('SHA-256', encoder.encode(body)))

const importKey = (secret: string) => {
  let key = keyCache.get(secret)
  if (!key) {
    key = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    keyCache.set(secret, key)
  }
  return key
}

export const signCanonical = async (secret: string, canonical: string) =>
  toBase64Url(await crypto.subtle.sign('HMAC', await importKey(secret), encoder.encode(canonical)))

/** 16 字节随机数的 base64url（22 个字符），满足代理要求的 8～64 位 `[A-Za-z0-9_-]`。 */
export const createNonce = () => toBase64Url(crypto.getRandomValues(new Uint8Array(16)))

/**
 * 为已解析的最终请求地址签名，返回追加了签名参数的新地址。
 * 签名使用 `URL` 解析后的 pathname 与 search，和代理（同样遵循 WHATWG URL）看到的字符串一致。
 */
export const signRequestUrl = async (
  config: ApiSignConfig,
  method: string,
  url: URL,
  body?: string,
  nowMs = Date.now(),
) => {
  const ts = signingTimestamp(nowMs)
  const nonce = createNonce()
  const query = url.search.replace(/^\?/, '')
  const sig = await signCanonical(
    config.key,
    canonicalString({
      method,
      pathname: url.pathname,
      query,
      bodyHash: await sha256Hex(body),
      ts,
      nonce,
    }),
  )
  const signed = new URL(url)
  const tail = `_kid=${config.kid}&_ts=${ts}&_nonce=${nonce}&_sig=${sig}`
  signed.search = query ? `?${query}&${tail}` : `?${tail}`
  return signed
}
