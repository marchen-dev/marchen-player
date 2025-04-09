import { useCallback, useSyncExternalStore } from 'react'

export const useNetworkStatus = () => {
  return useSyncExternalStore(
    useCallback((callback: () => void) => {
      window.addEventListener('online', callback)
      window.addEventListener('offline', callback)
      return () => {
        window.removeEventListener('online', callback)
        window.removeEventListener('offline', callback)
      }
    }, []),
    () => navigator.onLine,
  )
}