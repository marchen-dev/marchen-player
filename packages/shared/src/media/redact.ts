/** 网络视频 URL 可在路径或查询中携带凭证，诊断中只保留站点。 */
export function redactMediaAddresses<T>(value: T): T {
  const seen = new WeakSet<object>()
  const visit = (item: unknown): unknown => {
    if (typeof item === 'string')
      return item.replace(/https?:\/\/[^\s"'<>]+/gi, (url) => {
        if (/^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/v1\/media\//i.test(url))
          return url.replace(/(\/v1\/media\/)[^/]+/, '$1[Filtered]').split('?')[0]
        try {
          return `${new URL(url).origin}/[Filtered]`
        } catch {
          return '[URL]'
        }
      })
    if (!item || typeof item !== 'object') return item
    if (seen.has(item)) return '[Circular]'
    seen.add(item)
    if (Array.isArray(item)) return item.map(visit)
    return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, visit(value)]))
  }
  return visit(value) as T
}
