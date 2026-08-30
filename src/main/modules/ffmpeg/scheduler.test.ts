import { describe, expect, it } from 'vitest'

import { FfmpegTaskScheduler } from './scheduler'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('ffmpegTaskScheduler', () => {
  it('限制重型任务并发', async () => {
    const scheduler = new FfmpegTaskScheduler({ maxConcurrent: 3, maxConcurrentHeavy: 1 })
    const gate = deferred()
    let running = 0
    let peak = 0
    const run = () =>
      scheduler.schedule({
        kind: 'playback',
        run: async () => {
          running += 1
          peak = Math.max(peak, running)
          await gate.promise
          running -= 1
        },
      })

    const tasks = [run(), run(), run()]
    await Promise.resolve()
    expect(scheduler.runningCount).toBe(1)
    gate.resolve()
    await Promise.all(tasks)
    expect(peak).toBe(1)
  })

  it('排队中的兼容播放优先于截图和缩略图', async () => {
    const scheduler = new FfmpegTaskScheduler({ maxConcurrent: 1 })
    const gate = deferred()
    const order: string[] = []
    const blocker = scheduler.schedule({
      kind: 'thumbnail',
      run: async () => {
        order.push('running-thumbnail')
        await gate.promise
      },
    })
    const screenshot = scheduler.schedule({
      kind: 'screenshot',
      run: async () => void order.push('screenshot'),
    })
    const thumbnail = scheduler.schedule({
      kind: 'thumbnail',
      run: async () => void order.push('thumbnail'),
    })
    const playback = scheduler.schedule({
      kind: 'playback',
      run: async () => void order.push('playback'),
    })

    gate.resolve()
    await Promise.all([blocker, screenshot, thumbnail, playback])
    expect(order).toEqual(['running-thumbnail', 'playback', 'screenshot', 'thumbnail'])
  })

  it('取消排队任务后不会执行', async () => {
    const scheduler = new FfmpegTaskScheduler({ maxConcurrent: 1 })
    const gate = deferred()
    const blocker = scheduler.schedule({ kind: 'playback', run: () => gate.promise })
    const controller = new AbortController()
    let called = false
    const cancelled = scheduler.schedule({
      kind: 'subtitle',
      signal: controller.signal,
      run: async () => {
        called = true
      },
    })
    controller.abort()

    await expect(cancelled).rejects.toMatchObject({ name: 'FfmpegTaskCancelledError' })
    gate.resolve()
    await blocker
    expect(called).toBe(false)
  })
})
