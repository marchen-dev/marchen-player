/**
 * PGS 时间窗口的纯函数规划：给定显示集时间表和已知信息，决定读哪些块、合成哪些显示集。
 * 不做 I/O，便于单元测试；参数是内部策略（见 design 第 4 节），可以在验收中调整。
 */
export const PGS_WINDOW = {
  /** 前方读取：时间或字节先到为准 */
  aheadSeconds: 30,
  aheadBytes: 4 * 1024 * 1024,
  /** 提前解码：时间或像素先到为准（800 万像素约 32 MB RGBA） */
  decodeSeconds: 2,
  decodePixels: 8_000_000,
  /** 已读取并解析的块（解压后字节数）的缓存上限 */
  cachedBytes: 16 * 1024 * 1024,
  /** 回溯找 epoch 起点的上限 */
  backtrackSets: 64,
  backtrackBytes: 8 * 1024 * 1024,
  /** 同时进行的块读取数；前方读取每次位置更新都会重新规划，不需要单独的补读阈值 */
  concurrency: 4,
  /** 连续这么多个块失败时判定会话失败 */
  maxConsecutiveFailures: 5,
  /** 缺少字幕索引时：首次扫描范围与后台推进上限 */
  scanBehindSeconds: 10,
  scanAheadSeconds: 5,
  scanBackfillSeconds: 30,
  scanLeadSeconds: 30,
  /** 单次扫描的时间跨度上限，后台推进按这个粒度分段 */
  scanChunkSeconds: 10,
} as const

export type PgsWindowParams = { [K in keyof typeof PGS_WINDOW]: number }

/** 开始时间 ≤ t 的最后一个显示集；没有时返回 -1。times 必须升序 */
export function activeIndex(times: readonly number[], t: number): number {
  let low = 0
  let high = times.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (times[middle] <= t) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}

/** 回溯的单步结论：找到起点、需要先读某个块才能判断、或超出上限 */
export type BacktrackResult =
  | { kind: 'found'; start: number; steps: number }
  | { kind: 'need'; index: number }
  | { kind: 'exceeded'; steps: number }

/**
 * 从 index 往回找第一个可独立显示的显示集。
 * independent(k) 返回 undefined 表示该块尚未读取；bytes(k) 为已读块的大小（未读为 0）。
 */
export function backtrack(
  index: number,
  independent: (k: number) => boolean | undefined,
  bytes: (k: number) => number,
  params: Pick<PgsWindowParams, 'backtrackSets' | 'backtrackBytes'> = PGS_WINDOW,
): BacktrackResult {
  let total = 0
  for (let k = index, steps = 0; k >= 0; k--, steps++) {
    if (steps >= params.backtrackSets) return { kind: 'exceeded', steps }
    const state = independent(k)
    if (state === undefined) return { kind: 'need', index: k }
    total += bytes(k)
    if (total > params.backtrackBytes) return { kind: 'exceeded', steps }
    if (state) return { kind: 'found', start: k, steps }
  }
  // 一直回到第一个显示集都不能独立显示：数据本身有问题，按超限处理
  return { kind: 'exceeded', steps: index + 1 }
}

/**
 * 前方读取范围 [from, end)：时间不超过 t + aheadSeconds，已知字节累计不超过 aheadBytes。
 * 未读的块按 0 字节计，读到后下次规划自然收紧。
 */
export function readAheadEnd(
  times: readonly number[],
  from: number,
  t: number,
  bytes: (k: number) => number,
  params: Pick<PgsWindowParams, 'aheadSeconds' | 'aheadBytes'> = PGS_WINDOW,
): number {
  let total = 0
  let k = Math.max(0, from)
  for (; k < times.length; k++) {
    if (times[k] > t + params.aheadSeconds) break
    total += bytes(k)
    if (total > params.aheadBytes && k > from) break
  }
  return k
}

/**
 * 提前解码范围 [from, end)：时间不超过 t + decodeSeconds，像素累计不超过 decodePixels。
 * 第一个（当前显示的）总会包含在内，保证当前字幕不因预算缺失。
 */
export function decodeAheadEnd(
  times: readonly number[],
  from: number,
  t: number,
  pixels: (k: number) => number,
  params: Pick<PgsWindowParams, 'decodeSeconds' | 'decodePixels'> = PGS_WINDOW,
): number {
  let total = 0
  let k = Math.max(0, from)
  for (; k < times.length; k++) {
    if (k > from && times[k] > t + params.decodeSeconds) break
    total += pixels(k)
    if (total > params.decodePixels && k > from) break
  }
  return k
}

/** 合并时间区间，用于记录已扫描范围（缺少字幕索引时） */
export function mergeRanges(ranges: readonly [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1]
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  return merged
}

/** [from, to] 中尚未被 ranges 覆盖的部分 */
export function uncovered(ranges: readonly [number, number][], from: number, to: number): [number, number][] {
  const gaps: [number, number][] = []
  let cursor = from
  for (const [start, end] of mergeRanges(ranges)) {
    if (end <= cursor) continue
    if (start >= to) break
    if (start > cursor) gaps.push([cursor, Math.min(start, to)])
    cursor = Math.max(cursor, end)
    if (cursor >= to) break
  }
  if (cursor < to) gaps.push([cursor, to])
  return gaps
}
