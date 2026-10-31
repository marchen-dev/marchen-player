import type { LoadingState } from '@marchen/player-loading'

/**
 * 加载进度条模型（纯函数）
 *
 * 进度条不是真实的完成百分比，而是把「正在快速推进」的感觉映射到各加载步骤上：
 * - 每个步骤占一段区间，区间长度按真实耗时分配，而不是平均分配
 *   （本地导入与识别通常 <0.5s，等待集中在匹配与获取弹幕两次网络请求）
 * - 段内按渐近曲线爬升，开头快、越来越慢，永远停在段终点之前，慢的时候也一直在动
 * - 步骤真正完成时直接进入下一段起点，视觉上是「又快了一步」的跳动
 * - 远程来源的导入段有真实字节进度，直接按比例映射，不做模拟
 */

/** 参与进度计算的步骤；waiting_user / match_failed 停在匹配段 */
export type ProgressStep = 'importing' | 'hashing' | 'matching' | 'loading_danmaku'

/** local：本地 / Web 文件 / 媒体源等导入很快的来源；remote：需要读取识别前缀的远程来源 */
export type ProgressProfile = 'local' | 'remote'

type Segments = Record<ProgressStep, readonly [start: number, end: number]>

const SEGMENTS: Record<ProgressProfile, Segments> = {
  local: {
    importing: [0, 0.08],
    hashing: [0.08, 0.15],
    matching: [0.15, 0.55],
    loading_danmaku: [0.55, 1],
  },
  remote: {
    importing: [0, 0.4],
    hashing: [0.4, 0.45],
    matching: [0.45, 0.7],
    loading_danmaku: [0.7, 1],
  },
}

/** 各步骤的典型耗时（毫秒），作为渐近曲线的时间常数：经过 τ 时约走完段内爬升的 63% */
const TAU_MS: Record<ProgressStep, number> = {
  importing: 300,
  hashing: 300,
  matching: 2000,
  loading_danmaku: 1500,
}

/** 段内模拟爬升的上限，留出余量给「完成时补满」的跳动 */
export const CREEP_CAP = 0.9

/** 把加载状态归到进度步骤；paused 表示在等用户或已失败，进度不再爬升 */
export function toProgressStep(
  step: LoadingState['step'],
): { step: ProgressStep; paused: boolean } | null {
  switch (step) {
    case 'importing':
    case 'hashing':
    case 'matching':
    case 'loading_danmaku':
      return { step, paused: false }
    case 'waiting_user':
    case 'match_failed':
      return { step: 'matching', paused: true }
    default:
      return null
  }
}

export interface ProgressInput {
  step: ProgressStep
  profile: ProgressProfile
  /** 在当前步骤已停留的时间 */
  elapsedMs: number
  /** 真实完成比例（0～1），目前只有远程导入段提供 */
  ratio?: number
  /** 减少动态效果：不做模拟爬升，只在步骤完成时跳格 */
  reducedMotion?: boolean
}

/** 当前步骤对应的目标进度（0～1），调用方需用 {@link advanceProgress} 保证单调 */
export function progressTarget(input: ProgressInput): number {
  const [start, end] = SEGMENTS[input.profile][input.step]
  const span = end - start
  if (input.ratio !== undefined) return start + span * clamp01(input.ratio)
  if (input.reducedMotion) return start
  const elapsed = Math.max(0, input.elapsedMs)
  return start + span * CREEP_CAP * (1 - Math.exp(-elapsed / TAU_MS[input.step]))
}

/** 进度只增不减：来源判定变化或重试匹配时，从当前值继续往前 */
export function advanceProgress(previous: number, target: number): number {
  return Math.max(previous, clamp01(target))
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}
