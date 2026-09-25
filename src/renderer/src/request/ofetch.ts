import { toast } from '@renderer/components/ui/toast'
import { API_URL } from '@renderer/lib/env'
import { ofetch } from 'ofetch'

const apiFetch = ofetch.create({
  baseURL: API_URL,
  timeout: 10000,
  onResponseError: (error) => {
    switch (error.response.status) {
      case 403: {
        toast({
          title: '403 Forbidden',
          description: `接口请求被拒绝, 请联系开发者更新相关秘钥 - ${error.response.url}`,
        })
        break
      }
      case 404: {
        break
      }
      default: {
        toast({
          title: '接口请求失败',
          description: error.request.toString(),
        })
      }
    }
  },
  // onResponse: (response) => {
  //   const responseData = response.response._data
  //   if (responseData?.success === false) {
  //     toast({
  //       description: responseData?.errorMessage,
  //     })
  //   }
  // },
})

/** 加载流程自行呈现可恢复错误，取消请求不触发全局错误提示。 */
export interface RequestControl {
  signal?: AbortSignal
  silent?: boolean
}

export const Get = <T = object>(
  url: string,
  params?: object,
  control?: RequestControl,
): Promise<T> =>
  apiFetch(url, {
    query: params,
    signal: control?.signal,
    ...(control?.silent ? { onResponseError: () => {} } : {}),
  })

export const Post = <T = object>(
  url: string,
  data?: object,
  control?: RequestControl,
): Promise<T> =>
  apiFetch(url, {
    method: 'POST',
    body: data,
    signal: control?.signal,
    ...(control?.silent ? { onResponseError: () => {} } : {}),
  })

export const Delete = <T = object>(url: string, params?: object): Promise<T> =>
  apiFetch(url, { method: 'DELETE', query: params })
