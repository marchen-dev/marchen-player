import { toast } from '@renderer/components/ui/toast'
import { API_ROUTES } from '@renderer/lib/env'
import { ofetch } from 'ofetch'
import { getApiRouteClient } from './api-route'

/** 加载流程自行呈现可恢复错误，取消请求不触发全局错误提示。 */
export interface RequestControl {
  signal?: AbortSignal
  silent?: boolean
  operationId?: string
}

const request = async <T>(
  url: string,
  method: 'GET' | 'POST' | 'DELETE',
  data?: object,
  control?: RequestControl,
): Promise<T> => {
  try {
    return await getApiRouteClient().request<T>(
      url,
      method,
      (route, signal) =>
        ofetch<T>(url, {
          baseURL: API_ROUTES[route],
          method,
          ...(method === 'POST' ? { body: data } : { query: data }),
          signal,
          // 超时与重试由线路层统一控制，避免多层重试扩大等待时间。
          retry: false,
        }),
      control,
    )
  } catch (error) {
    if (!control?.silent && !control?.signal?.aborted) {
      const response = (error as { response?: { status?: number; url?: string } })?.response
      if (response?.status === 403) {
        toast({
          title: '403 Forbidden',
          description: `接口请求被拒绝，请联系开发者 - ${response.url}`,
        })
      } else if (response?.status !== 404) {
        toast({ title: '接口请求失败', description: url })
      }
    }
    throw error
  }
}

export const Get = <T = object>(
  url: string,
  params?: object,
  control?: RequestControl,
): Promise<T> => request<T>(url, 'GET', params, control)

export const Post = <T = object>(
  url: string,
  data?: object,
  control?: RequestControl,
): Promise<T> => request<T>(url, 'POST', data, control)

export const Delete = <T = object>(url: string, params?: object): Promise<T> =>
  request<T>(url, 'DELETE', params)
