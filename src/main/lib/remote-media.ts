import { REMOTE_LIMITS, validateRemoteUrl } from '@marchen/shared/media/remote'

/** Node fetch 不使用 Electron 会话 Cookie，逐跳约束网络协议。 */
export const fetchRemoteMedia: typeof fetch = async (input, options) => {
  let url = validateRemoteUrl(String(input))
  for (let i = 0; i <= REMOTE_LIMITS.redirects; i++) {
    const response = await fetch(url, { ...options, redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('Location')
    await response.body?.cancel()
    if (!location || i === REMOTE_LIMITS.redirects) throw new Error('视频地址重定向失败')
    url = validateRemoteUrl(new URL(location, url).href)
  }
  throw new Error('视频地址重定向失败')
}
