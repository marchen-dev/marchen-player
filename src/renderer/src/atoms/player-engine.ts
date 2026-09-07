import type {
  EnginePreference,
  PlayerEngine,
} from '@renderer/services/player-runtime/engine-policy'
import { atom } from 'jotai'

export interface PlayerEngineState {
  preference: EnginePreference
  actual?: PlayerEngine
  pending?: EnginePreference
  switching: boolean
  error?: string
  selectPreference: (preference: EnginePreference) => Promise<void>
  retryCanvas: () => Promise<void>
}

/** 空闲时为 null；只存当前 UI 和命令，不持久化实际 backend 或资源令牌。 */
export const playerEngineStateAtom = atom<PlayerEngineState | null>(null)
