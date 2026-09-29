import type { DownloadSnapshot, DownloadTask } from '@marchen/shared/downloads'
import type { TelemetryEventMap } from './contracts'
import { telemetry } from './client'

const kind = (task: DownloadTask) => (task.http ? ('http' as const) : ('bt' as const))
/** 只构造白名单属性，任务 ID、文件名、地址、路径和错误原文绝不进入事件。 */
export class DownloadTelemetryObserver {
  private previous?: DownloadSnapshot
  private progress = new Map<string, { bytes: number; since: number; sent: boolean }>()
  constructor(
    private capture: typeof telemetry.capture = telemetry.capture,
    private now = () => Date.now(),
  ) {}
  tick() {
    if (this.previous) this.observe(this.previous, true)
  }
  observe(snapshot: DownloadSnapshot, heartbeat = false) {
    if (
      this.previous &&
      (snapshot.revision < this.previous.revision ||
        (snapshot.revision === this.previous.revision && !heartbeat))
    )
      return
    const now = this.now()
    for (const task of snapshot.tasks) {
      const old = this.previous?.tasks.find((item) => item.id === task.id)
      const verified = task.files
        .filter((file) => file.selected)
        .reduce((sum, file) => sum + file.verifiedBytes, 0)
      const selected = task.files.filter((file) => file.selected)
      let state: TelemetryEventMap['download_state_changed']['state'] | undefined
      // 首次快照只建立基线，不把历史任务误记成创建或完成。
      if (this.previous && !old) state = 'created'
      else if (
        old &&
        task.state === 'completed' &&
        old.state !== 'completed' &&
        !(old.state === 'checking' && old.completedAt)
      )
        state = 'completed'
      else if (old && task.state === 'error' && old.state !== 'error') state = 'failed'
      else if (old && task.files.some((file, i) => file.selected !== old.files[i]?.selected))
        state = 'selection_changed'
      if (state)
        this.capture('download_state_changed', {
          kind: kind(task),
          state,
          selected_count: selected.length,
          total_bytes: task.selectedBytes,
          verified_bytes: verified,
          elapsed_ms: Math.max(0, now - task.createdAt),
          ...(state === 'failed' ? { error_code: 'download_failed' as const } : {}),
        })
      const running =
        task.intent === 'running' &&
        (task.state === 'downloading' || (!task.http && task.state === 'waiting'))
      const progress = this.progress.get(task.id)
      if (!running) this.progress.delete(task.id)
      else if (!progress || progress.bytes !== verified || state === 'selection_changed')
        this.progress.set(task.id, { bytes: verified, since: now, sent: false })
      else if (!progress.sent && now - progress.since >= 60000) {
        progress.sent = true
        this.capture('download_progress_stalled', {
          kind: kind(task),
          stalled_ms: now - progress.since,
          received_bytes: task.http ? verified : (task.receivedBytes ?? 0),
          verified_bytes: verified,
          peers: task.peers,
          hash_failures: task.hashFailures ?? 0,
        })
      }
    }
    for (const id of this.progress.keys())
      if (!snapshot.tasks.some((task) => task.id === id)) this.progress.delete(id)
    this.previous = snapshot
  }
}
export const downloadTelemetry = new DownloadTelemetryObserver()

export async function trackDownloadAction<T>(
  task: DownloadTask,
  action: TelemetryEventMap['download_action_result']['action'],
  work: () => Promise<T>,
  deleteFiles?: boolean,
): Promise<T> {
  const start = performance.now()
  let result: 'success' | 'failed' = 'failed'
  try {
    const value = await work()
    result = 'success'
    return value
  } finally {
    telemetry.capture('download_action_result', {
      kind: kind(task),
      action,
      result,
      duration_ms: Math.round(performance.now() - start),
      ...(deleteFiles === undefined ? {} : { delete_files: deleteFiles }),
    })
  }
}
export async function trackDownloadAdd<T>(
  input: TelemetryEventMap['download_add_result']['input'],
  stage: 'metadata' | 'create',
  work: () => Promise<T>,
): Promise<T> {
  const start = performance.now()
  let result: 'success' | 'failed' = 'failed'
  try {
    const value = await work()
    result = 'success'
    return value
  } finally {
    telemetry.capture('download_add_result', {
      input,
      stage,
      result,
      duration_ms: Math.round(performance.now() - start),
    })
  }
}
