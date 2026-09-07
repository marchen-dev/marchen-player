import type { FrameRequest } from './frame-tools'
import { captureMediaFrame } from './frame-tools'

interface Task {
  owner: string
  key: string
  priority: number
  request: FrameRequest
  abort: AbortController
  preempted: boolean
  settled: boolean
  resolve: (value: string) => void
  reject: (error: unknown) => void
}
const cancelled = () => new DOMException('取帧请求已被替代', 'AbortError')

/** 全局一个辅助解码器，预览按消费者 latest-wins；缓存总量不超过 64 MiB。 */
export class MediaFrameQueue {
  private queue: Task[] = []
  private active?: Task
  private readonly cache = new Map<string, string>()
  private bytes = 0
  constructor(private readonly capture = captureMediaFrame) {}
  request(owner: string, request: FrameRequest, priority = 1): Promise<string> {
    request.signal?.throwIfAborted()
    this.cancel(owner)
    const key = `${request.source.hash}:${request.source.size}:${request.time.toFixed(3)}:${request.rotation ?? 0}:${request.maxWidth ?? 0}`
    const cached = this.cache.get(key)
    if (cached) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      return Promise.resolve(cached)
    }
    return new Promise((resolve, reject) => {
      const cleanup = () => request.signal?.removeEventListener('abort', abort)
      const task: Task = {
        owner,
        key,
        priority,
        request,
        abort: new AbortController(),
        preempted: false,
        settled: false,
        resolve: (value) => {
          task.settled = true
          cleanup()
          resolve(value)
        },
        reject: (error) => {
          task.settled = true
          cleanup()
          reject(error)
        },
      }
      const abort = () => {
        this.queue = this.queue.filter((item) => item !== task)
        task.abort.abort()
        task.reject(cancelled())
      }
      request.signal?.addEventListener('abort', abort, { once: true })
      this.queue.push(task)
      // 交互取帧抢占后台任务；后台请求在交互完成后重新排队，而不是永久丢失历史封面。
      if (this.active && this.active.priority < priority) {
        this.active.preempted = true
        this.active.abort.abort()
      }
      this.pump()
    })
  }
  cancel(owner: string) {
    this.queue = this.queue.filter((task) => {
      if (task.owner !== owner) return true
      task.reject(cancelled())
      return false
    })
    if (this.active?.owner === owner) {
      this.active.preempted = false
      this.active.abort.abort()
      this.active.reject(cancelled())
    }
  }
  private pump() {
    if (this.active || !this.queue.length) return
    this.queue.sort((a, b) => b.priority - a.priority)
    const task = (this.active = this.queue.shift()!)
    const signal = task.request.signal
      ? AbortSignal.any([task.request.signal, task.abort.signal])
      : task.abort.signal
    void this.capture({ ...task.request, signal })
      .then((result) => {
        signal.throwIfAborted()
        this.bytes -= (this.cache.get(task.key)?.length ?? 0) * 2
        this.cache.set(task.key, result)
        this.bytes += result.length * 2
        while (this.bytes > 64 * 1024 * 1024 && this.cache.size) {
          const key = this.cache.keys().next().value!
          this.bytes -= this.cache.get(key)!.length * 2
          this.cache.delete(key)
        }
        task.resolve(result)
      })
      .catch((error) => {
        if (task.preempted && !task.settled && !task.request.signal?.aborted) {
          task.abort = new AbortController()
          task.preempted = false
          this.queue.push(task)
        } else task.reject(error)
      })
      .finally(() => {
        this.active = undefined
        this.pump()
      })
  }
}
export const mediaFrameQueue = new MediaFrameQueue()
