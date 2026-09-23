import { describe, expect, it, vi } from 'vitest'
import { UpdateSaveBarrier } from './update-save'

describe('安装前保存屏障', () => {
  it('合并同时退出请求，只接受当前回执', async () => {
    let id = ''
    const send = vi.fn((value: string) => {
      id = value
    })
    const barrier = new UpdateSaveBarrier(send)
    const first = barrier.wait()
    expect(barrier.wait()).toBe(first)
    barrier.finish('stale', true)
    expect(send).toHaveBeenCalledTimes(1)
    barrier.finish(id, true)
    await first
  })
  it('保存超时拒绝退出，迟到回执不能解除重试屏障', async () => {
    vi.useFakeTimers()
    const ids: string[] = []
    const barrier = new UpdateSaveBarrier((id) => ids.push(id), 5000)
    const result = expect(barrier.wait()).rejects.toThrow('超时')
    await vi.advanceTimersByTimeAsync(5000)
    await result
    const retry = barrier.wait()
    barrier.finish(ids[0], true)
    barrier.finish(ids[1], false, '写入失败')
    await expect(retry).rejects.toThrow('写入失败')
    vi.useRealTimers()
  })
})
