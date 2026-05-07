import type { AIModelInfo, AIProviderType } from '../models/ai'
import { ofetch } from 'ofetch'

function buildHeaders(type: AIProviderType, apiKey: string): Record<string, string> {
  if (type === 'anthropic') {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
  }
  return {
    Authorization: `Bearer ${apiKey}`,
  }
}

async function fetchModels(
  type: AIProviderType,
  apiKey: string,
  baseUrl: string,
): Promise<AIModelInfo[]> {
  const headers = buildHeaders(type, apiKey)
  const response = await ofetch<{ data: Array<{ id: string }> }>('/models', {
    baseURL: baseUrl,
    headers,
    timeout: 15000,
  })
  return (response.data ?? []).map((m) => ({ id: m.id }))
}

async function testConnection(
  type: AIProviderType,
  apiKey: string,
  baseUrl: string,
): Promise<{ success: boolean; message: string }> {
  try {
    await fetchModels(type, apiKey, baseUrl)
    return { success: true, message: '连接成功' }
  } catch (error: any) {
    const status = error?.response?.status
    if (status === 401 || status === 403) {
      return { success: false, message: `认证失败: ${status}` }
    }
    if (error?.name === 'AbortError' || error?.message?.includes('timeout')) {
      return { success: false, message: '网络超时' }
    }
    return { success: false, message: error?.message || '连接失败' }
  }
}

export const ai = {
  fetchModels,
  testConnection,
}
