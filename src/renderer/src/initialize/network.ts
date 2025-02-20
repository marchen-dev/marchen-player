import { jotaiStore } from '@renderer/atoms/store'
import { atom, useAtomValue } from 'jotai'

export enum NetworkStatus {
  OFFLINE,
  ONLINE,
}

const netWorkAtom = atom(NetworkStatus.ONLINE)

export const useNetworkStatus = () => useAtomValue(netWorkAtom)

export const subscribeNetWorkStatus = () => {
  const handleOnline = () => jotaiStore.set(netWorkAtom, NetworkStatus.ONLINE)
  const handleOffline = () => jotaiStore.set(netWorkAtom, NetworkStatus.OFFLINE)
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}

export const updateProgressAtom = atom<{
  progress: number
  status: 'downloading' | 'installing'
} | null>(null)
