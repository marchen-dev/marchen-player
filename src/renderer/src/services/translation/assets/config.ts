export interface TranslationAssetsEnvironment {
  VITE_TRANSLATION_ASSETS_URL?: string
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * 读取翻译资源（引擎 WASM 与模型）的存储桶基址，构建脚本与 Renderer 共用。
 *
 * 本地开发与 PR 检查可以不配置：返回 null，弹幕翻译判定为「不支持」。
 * Web 正式构建与桌面发行把它列为必填，由发布脚本与 release.yml 在构建前检查。
 * 配置了但格式非法时抛错，避免把打不开的地址带进正式包。
 * 本机回环地址允许 HTTP，用于存储桶未就绪时的本地验证。
 */
export const readTranslationAssetsBase = (env: TranslationAssetsEnvironment): string | null => {
  const value = env.VITE_TRANSLATION_ASSETS_URL?.trim()
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('翻译资源配置 VITE_TRANSLATION_ASSETS_URL 必须是有效的 HTTPS 地址')
  }
  const secure =
    url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))
  if (!secure || url.search || url.hash) {
    throw new Error('翻译资源配置 VITE_TRANSLATION_ASSETS_URL 必须是无查询参数和片段的 HTTPS 基址')
  }
  return url.toString().replace(/\/+$/, '')
}
