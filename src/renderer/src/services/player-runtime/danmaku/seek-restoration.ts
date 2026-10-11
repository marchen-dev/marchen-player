import type { DanmakuEngineCore, DanmakuItem, DanmakuMeasuredItem } from '@marchen/danmaku-engine'

export class DanmakuRestoreBudgetError extends Error {
  constructor() {
    super('弹幕恢复未能及时追上媒体时间')
  }
}

/** 主动让出任务队列，取消时立即结束等待，不留下 rAF/定时器。 */
const yieldTask = (signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, 0)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })

/** 测量/模拟分批执行；返回前追赶一次新时间段，尾段由正常调度处理。 */
export const prepareSeekRestoration = async (
  engine: DanmakuEngineCore,
  target: number,
  now: () => number,
  measure: (items: ReadonlyArray<DanmakuItem>) => ReadonlyArray<DanmakuMeasuredItem>,
  signal: AbortSignal,
) => {
  const restoration = engine.beginRestoration(240)
  let budgetStart = performance.now()
  const appendRange = async (after: number, through: number) => {
    signal.throwIfAborted()
    const items = engine.getRestoreCandidates(after, through)
    for (let index = 0; index < items.length; index += 32) {
      signal.throwIfAborted()
      restoration.append(measure(items.slice(index, index + 32)))
      if (performance.now() - budgetStart >= 4) {
        await yieldTask(signal)
        budgetStart = performance.now()
      }
    }
  }
  await appendRange(target - restoration.config.duration, target)
  let through = target
  // 有界追赶，避免播放中的高密度流令恢复工作永远无法提交。
  for (let round = 0; round < 3; round += 1) {
    signal.throwIfAborted()
    const at = now()
    if (at < through || at - through >= restoration.config.duration)
      throw new DanmakuRestoreBudgetError()
    if (at === through) break
    await appendRange(through, at)
    through = at
    if (now() - through < 0.01) break
  }
  signal.throwIfAborted()
  const at = now()
  // 超过实时调度的 250ms 容差就重新构建，不能把该段候选静默漏掉。
  if (at < through || at - through > 0.25) throw new DanmakuRestoreBudgetError()
  return { restoration, through }
}
