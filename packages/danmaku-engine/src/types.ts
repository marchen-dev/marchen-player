export type DanmakuMode = 'scroll' | 'top' | 'bottom'

export interface DanmakuItem {
  id: string
  time: number
  text: string
  mode: DanmakuMode
  color: string
  fontSize?: number
}

export interface DanmakuClock {
  now: () => number
}

export interface DanmakuMetrics {
  width: number
  height: number
}

export interface DanmakuMeasuredItem {
  item: DanmakuItem
  metrics: DanmakuMetrics | null
}

export interface DanmakuConfig {
  enabled: boolean
  duration: number
  fontSize: number
  displayArea: number
  maxOnScreen: number
  lookAhead: number
  laneGap: number
}

export interface DanmakuLayout {
  width: number
  height: number
  exclusionRect?: DanmakuRect | null
}

export interface DanmakuRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface DanmakuPlacement {
  item: DanmakuItem
  lane: number
  laneSpan: number
  y: number
  width: number
  height: number
  duration: number
  playbackRate: number
  startDelay: number
}

export type DanmakuLifecycleState = 'pending' | 'running' | 'paused'

export interface DanmakuMotionSnapshot {
  id: string
  mode: DanmakuMode
  state: DanmakuLifecycleState
  lane: number
  laneSpan: number
  elapsed: number
  left: number
  right: number
  top: number
  bottom: number
}

export interface DanmakuDiagnostics {
  active: number
  peakActive: number
  dropped: number
}

export const DEFAULT_DANMAKU_CONFIG: DanmakuConfig = {
  enabled: true,
  duration: 8,
  fontSize: 26,
  displayArea: 0.5,
  maxOnScreen: 80,
  lookAhead: 0.08,
  laneGap: 12,
}
