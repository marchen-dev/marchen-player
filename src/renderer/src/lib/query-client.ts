import { QueryClient } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchIntervalInBackground: false,
      refetchOnReconnect: false,
      // 10 分钟后回收缓存
      gcTime: 10 * 60 * 1000,
      // 5 分钟内视为新鲜，不重新请求
      staleTime: 5 * 60 * 1000,
    },
  },
})

export default queryClient
