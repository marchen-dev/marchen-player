import { QueryClient } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchIntervalInBackground: false,
      refetchOnReconnect: false,
      gcTime: 0,
      staleTime: 0,
    },
  },
})

export default queryClient
