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

export interface ApiSignEnvironment {
  VITE_API_SIGN_KID?: string
  VITE_API_SIGN_KEY?: string
}

export interface ApiSignConfig {
  kid: string
  key: string
}

/**
 * 请求签名配置。密钥随客户端分发，签名只用于提高调用门槛和区分来源（Web 用 w1、桌面用 d1）。
 * 两个变量同时缺省返回 null：PR / 预览构建与本地开发不签名；正式构建由发行脚本另行要求必填。
 * 错误只指出变量名，不输出密钥。
 */
export const readApiSignConfig = (env: ApiSignEnvironment): ApiSignConfig | null => {
  const kid = env.VITE_API_SIGN_KID?.trim() ?? ''
  const key = env.VITE_API_SIGN_KEY?.trim() ?? ''
  if (!kid && !key) return null
  if (!kid) throw new Error('签名配置缺少 VITE_API_SIGN_KID')
  if (!key) throw new Error('签名配置缺少 VITE_API_SIGN_KEY')
  if (!/^[\w-]{1,16}$/.test(kid))
    throw new Error('签名配置 VITE_API_SIGN_KID 只能包含字母、数字、下划线和连字符')
  return { kid, key }
}
