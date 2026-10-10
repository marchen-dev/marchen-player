export interface ApiRouteEnvironment {
  VITE_API_CLOUDFLARE_URL?: string
  VITE_API_EDGEONE_URL?: string
}

/** 构建入口和 Renderer 共用校验，错误只指出变量名，不输出整个环境。 */
export const readApiRouteConfig = (env: ApiRouteEnvironment) => {
  const read = (name: keyof ApiRouteEnvironment): string => {
    const value = env[name]?.trim()
    if (!value) throw new Error(`缺少 API 线路配置：${name}`)
    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw new Error(`API 线路配置 ${name} 必须是有效的 HTTPS 地址`)
    }
    if (url.protocol !== 'https:' || url.search || url.hash) {
      throw new Error(`API 线路配置 ${name} 必须是无查询参数和片段的 HTTPS 基址`)
    }
    return url.toString().replace(/\/+$/, '')
  }
  return {
    cloudflare: read('VITE_API_CLOUDFLARE_URL'),
    edgeone: read('VITE_API_EDGEONE_URL'),
  }
}
