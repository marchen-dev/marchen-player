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

export const Get = <T = object>(url: string, params?: object): Promise<T> =>
  apiFetch(url, { query: params })

export const Post = <T = object>(url: string, data?: object): Promise<T> =>
  apiFetch(url, { method: 'POST', body: data })

export const Delete = <T = object>(url: string, params?: object): Promise<T> =>
  apiFetch(url, { method: 'DELETE', query: params })
