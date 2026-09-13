import { getStorageNS } from '@renderer/lib/ns'
import { atomWithStorage, createJSONStorage } from 'jotai/utils'

export const createSettingATom = <T extends object>(
  settingKey: string,
  createDefaultSettings: () => T,
  normalize: (value: T) => T = (value) => value,
) => {
  const storage = createJSONStorage<T>()
  return atomWithStorage(
    getStorageNS(settingKey),
    createDefaultSettings(),
    {
      ...storage,
      getItem: (key, initialValue) => normalize(storage.getItem(key, initialValue)),
      setItem: (key, value) => storage.setItem(key, normalize(value)),
      subscribe: storage.subscribe
        ? (key, callback, initialValue) =>
            storage.subscribe!(key, (value) => callback(normalize(value)), initialValue)
        : undefined,
    },
    {
      getOnInit: true,
    },
  )
}
