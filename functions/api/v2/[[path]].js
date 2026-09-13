// 固定上游，不接受客户端指定目标；保留同源 API，避免依赖 Vite 开发代理。
export async function onRequest({ request }) {
  if (!['GET', 'HEAD', 'POST', 'OPTIONS'].includes(request.method))
    return new Response(null, { status: 405 })
  const incoming = new URL(request.url)
  if (!incoming.pathname.startsWith('/api/v2/')) return new Response(null, { status: 404 })
  const target = new URL('https://dandan-proxy.suemor.com')
  target.pathname = incoming.pathname
  target.search = incoming.search
  const headers = new Headers()
  for (const name of ['accept', 'content-type']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      signal: controller.signal,
      redirect: 'error',
    })
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store' })
    const contentType = upstream.headers.get('content-type')
    if (contentType) responseHeaders.set('Content-Type', contentType)
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
  } catch {
    return Response.json({ error: '上游 API 暂时不可用' }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
