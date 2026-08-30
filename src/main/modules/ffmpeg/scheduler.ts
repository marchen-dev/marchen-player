export type FfmpegTaskKind = 'playback' | 'probe' | 'screenshot' | 'subtitle' | 'thumbnail'

export type FfmpegTaskWeight = 'heavy' | 'light'

export interface FfmpegScheduledTaskOptions<T> {
  kind: FfmpegTaskKind
  weight?: FfmpegTaskWeight
  signal?: AbortSignal
  run: (signal: AbortSignal) => Promise<T>
}

interface QueuedTask<T> extends FfmpegScheduledTaskOptions<T> {
  sequence: number
  weight: FfmpegTaskWeight
  controller: AbortController
  resolve: (value: T) => void
  reject: (reason: unknown) => void
  removeAbortListener: () => void
}

export class FfmpegTaskCancelledError extends Error {
  constructor(message = 'FFmpeg 任务已取消') {
    super(message)
    this.name = 'FfmpegTaskCancelledError'
  }
}

const TASK_PRIORITY: Record<FfmpegTaskKind, number> = {
  playback: 0,
  probe: 1,
  screenshot: 2,
  subtitle: 2,
  thumbnail: 3,
}

const DEFAULT_WEIGHT: Record<FfmpegTaskKind, FfmpegTaskWeight> = {
  playback: 'heavy',
  probe: 'light',
  screenshot: 'light',
  subtitle: 'light',
  thumbnail: 'light',
}

export interface FfmpegTaskSchedulerOptions {
  maxConcurrent?: number
  maxConcurrentHeavy?: number
}

export class FfmpegTaskScheduler {
  readonly #maxConcurrent: number
  readonly #maxConcurrentHeavy: number
  readonly #queue: Array<QueuedTask<unknown>> = []
  readonly #running = new Set<QueuedTask<unknown>>()
  #runningHeavy = 0
  #sequence = 0
  #closed = false

  constructor(options: FfmpegTaskSchedulerOptions = {}) {
    this.#maxConcurrent = Math.max(1, options.maxConcurrent ?? 2)
    this.#maxConcurrentHeavy = Math.max(1, options.maxConcurrentHeavy ?? 1)
  }

  get pendingCount(): number {
    return this.#queue.length
  }

  get runningCount(): number {
    return this.#running.size
  }

  schedule<T>(options: FfmpegScheduledTaskOptions<T>): Promise<T> {
    if (this.#closed) return Promise.reject(new FfmpegTaskCancelledError('FFmpeg 调度器已关闭'))
    if (options.signal?.aborted) return Promise.reject(new FfmpegTaskCancelledError())

    return new Promise<T>((resolve, reject) => {
      const controller = new AbortController()
      const task: QueuedTask<T> = {
        ...options,
        sequence: this.#sequence++,
        weight: options.weight ?? DEFAULT_WEIGHT[options.kind],
        controller,
        resolve,
        reject,
        removeAbortListener: () => undefined,
      }
      const onAbort = () => {
        const queuedIndex = this.#queue.indexOf(task as QueuedTask<unknown>)
        if (queuedIndex >= 0) {
          this.#queue.splice(queuedIndex, 1)
          task.removeAbortListener()
          reject(new FfmpegTaskCancelledError())
          return
        }
        controller.abort(options.signal?.reason)
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })
      task.removeAbortListener = () => options.signal?.removeEventListener('abort', onAbort)

      this.#queue.push(task as QueuedTask<unknown>)
      this.#queue.sort(
        (left, right) =>
          TASK_PRIORITY[left.kind] - TASK_PRIORITY[right.kind] || left.sequence - right.sequence,
      )
      this.#drain()
    })
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    for (const task of this.#queue.splice(0)) {
      task.removeAbortListener()
      task.reject(new FfmpegTaskCancelledError('FFmpeg 调度器已关闭'))
    }
    for (const task of this.#running) task.controller.abort('scheduler-closed')
  }

  #drain(): void {
    while (this.#running.size < this.#maxConcurrent) {
      const index = this.#queue.findIndex(
        (task) => task.weight === 'light' || this.#runningHeavy < this.#maxConcurrentHeavy,
      )
      if (index < 0) return
      const [task] = this.#queue.splice(index, 1)
      this.#running.add(task)
      if (task.weight === 'heavy') this.#runningHeavy += 1
      void task
        .run(task.controller.signal)
        .then(task.resolve, task.reject)
        .finally(() => {
          task.removeAbortListener()
          this.#running.delete(task)
          if (task.weight === 'heavy') this.#runningHeavy -= 1
          this.#drain()
        })
    }
  }
}
