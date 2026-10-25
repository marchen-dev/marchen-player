import { REMOTE_LIMITS, validateRemoteUrl } from '@marchen/shared/media/remote'

/**
 * 逐跳跟随重定向；`headersFor` 决定每一跳额外附加的请求头。
 * 鉴权头只能发给配置的服务器，跳到其他 origin（例如 alist 302 到网盘签名地址）时必须去掉。
 */
async function fetchFollowingRedirects(
  input: Parameters<typeof fetch>[0],
  options: RequestInit | undefined,
  headersFor: (url: string) => Record<string, string> | undefined,
) {
  let url = validateRemoteUrl(String(input))
  for (let i = 0; i <= REMOTE_LIMITS.redirects; i++) {
    const extra = headersFor(url)
    const headers = new Headers(options?.headers)
    if (extra) for (const [key, value] of Object.entries(extra)) headers.set(key, value)
    const response = await fetch(url, { ...options, headers, redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('Location')
    await response.body?.cancel()
    if (!location || i === REMOTE_LIMITS.redirects) throw new Error('视频地址重定向失败')
    url = validateRemoteUrl(new URL(location, url).href)
  }
  throw new Error('视频地址重定向失败')
}

/** Node fetch 不使用 Electron 会话 Cookie，逐跳约束网络协议。 */
export const fetchRemoteMedia: typeof fetch = (input, options) =>
  fetchFollowingRedirects(input, options, () => undefined)

/** 媒体源请求：只对来源自身的 origin 携带鉴权头。 */
export function createAuthorizedFetcher(
  authHeaders: Record<string, string>,
  authOrigin: string,
): typeof fetch {
  const origin = new URL(authOrigin).origin
  return (input, options) =>
    fetchFollowingRedirects(input, options, (url) =>
      new URL(url).origin === origin ? authHeaders : undefined,
    )
}
