import {
  ApiRouteClient,
  isApiRequestFailure,
  normalizeApiRouteMode,
} from '@renderer/request/api-route-client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const clients: ApiRouteClient[] = []
const setup = (mode: 'auto' | 'cloudflare' | 'edgeone' = 'auto') => {
  const observer = { changed: vi.fn(), completed: vi.fn(), recovered: vi.fn(), failed: vi.fn() }
  const client = new ApiRouteClient(mode, observer)
  clients.push(client)
  return { client, observer }
}
const httpError = (status: number) =>
  Object.assign(new Error('HTTP 请求失败'), { response: { status } })
const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  clients.splice(0).forEach((client) => client.dispose())
  vi.useRealTimers()
})

describe('接口主备线路', () => {
  it('默认只请求主线路，完成事件保留操作关联与一次尝试', async () => {
    const { client, observer } = setup()
    const send = vi.fn().mockResolvedValue({ success: true })
    await client.request('/match', 'POST', send, { operationId: 'load-1' })
    expect(send.mock.calls[0][0]).toBe('cloudflare')
    expect(send).toHaveBeenCalledTimes(1)
    expect(observer.completed).toHaveBeenCalledWith(
      expect.objectContaining({
        operation_id: 'load-1',
        endpoint: 'match',
        result: 'success',
        attempt_count: 1,
        recovered: false,
        attempts: [expect.objectContaining({ route: 'cloudflare', result: 'success' })],
      }),
    )
  })

  it.each([408, 500, 502, 503, 504, 545])('状态码 %i 会重试另一线路一次', async (status) => {
    const { client, observer } = setup()
    const send = vi
      .fn()
      .mockRejectedValueOnce(httpError(status))
      .mockResolvedValueOnce({ success: true })
    await client.request('/match', 'POST', send)
    expect(send.mock.calls.map((call) => call[0])).toEqual(['cloudflare', 'edgeone'])
    expect(client.getPreferred()).toBe('edgeone')
    expect(observer.completed).toHaveBeenCalledTimes(1)
    expect(observer.completed).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'success', recovered: true, attempt_count: 2 }),
    )
    expect(observer.recovered).toHaveBeenCalledTimes(1)
    expect(observer.failed).not.toHaveBeenCalled()
  })

  it.each([400, 401, 403, 404, 409, 429])('状态码 %i 不切换线路', async (status) => {
    const { client } = setup()
    const send = vi.fn().mockRejectedValue(httpError(status))
    await expect(client.request('/match', 'POST', send)).rejects.toThrow()
    expect(send).toHaveBeenCalledTimes(1)
    expect(client.getPreferred()).toBe('cloudflare')
  })

  it('网络故障切换成功后记忆五分钟，之后下一请求尝试主线路', async () => {
    vi.useFakeTimers()
    const { client, observer } = setup()
    const send = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ success: true })
    await client.request('/match', 'POST', send)
    await client.request('/comment/1', 'GET', send)
    expect(send.mock.calls.map((call) => call[0])).toEqual(['cloudflare', 'edgeone', 'edgeone'])
    await vi.advanceTimersByTimeAsync(300_000)
    expect(send).toHaveBeenCalledTimes(3)
    await client.request('/comment/1', 'GET', send)
    expect(send.mock.calls[3][0]).toBe('cloudflare')
    expect(observer.changed).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'cooldown_expired' }),
    )
  })

  it('备用也失败时不记忆，最终只上报一次错误并阻止 Query 再重试', async () => {
    const { client, observer } = setup()
    const error = new TypeError('Failed to fetch')
    const send = vi.fn().mockRejectedValue(error)
    await expect(client.request('/comment/1', 'GET', send)).rejects.toBe(error)
    expect(send).toHaveBeenCalledTimes(2)
    expect(client.getPreferred()).toBe('cloudflare')
    expect(observer.failed).toHaveBeenCalledTimes(1)
    expect(observer.completed).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'failed', recovered: false }),
    )
    expect(isApiRequestFailure(error)).toBe(true)
  })

  it.each(['cloudflare', 'edgeone'] as const)('手动 %s 失败时不降级', async (mode) => {
    const { client } = setup(mode)
    const send = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(client.request('/match', 'POST', send)).rejects.toThrow()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toBe(mode)
  })

  it.each([
    { success: false, errorCode: 100 },
    { success: true, isMatched: false },
    { count: 0, comments: [] },
  ])('有效业务响应不切换线路：%j', async (data) => {
    const { client, observer } = setup()
    const send = vi.fn().mockResolvedValue(data)
    await expect(client.request('/match', 'POST', send)).resolves.toEqual(data)
    expect(send).toHaveBeenCalledTimes(1)
    expect(observer.completed.mock.calls[0][0].result).toBe(
      data.success === false ? 'failed' : 'success',
    )
    expect(observer.failed).not.toHaveBeenCalled()
  })

  it('不能自动重放未知写接口', async () => {
    const { client } = setup()
    const send = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(client.request('/unknown', 'POST', send)).rejects.toThrow()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('携带外部 signal 时单次超时仍生效，并给备用新的 signal', async () => {
    vi.useFakeTimers()
    const { client, observer } = setup()
    const external = new AbortController()
    const send = vi
      .fn(
        (_route, signal: AbortSignal) =>
          new Promise<object>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true })
          }),
      )
      .mockImplementationOnce(
        (_route, signal: AbortSignal) =>
          new Promise<object>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true })
          }),
      )
      .mockResolvedValueOnce({ success: true })
    const promise = client.request('/match', 'POST', send, { signal: external.signal })
    await vi.advanceTimersByTimeAsync(8_000)
    await promise
    expect(send).toHaveBeenCalledTimes(2)
    expect(external.signal.aborted).toBe(false)
    expect(send.mock.calls[0][1]).not.toBe(send.mock.calls[1][1])
    expect(observer.completed.mock.calls[0][0].attempts[0].error_code).toBe('timeout')
  })

  it('备用十秒超时后整轮失败，没有第三次尝试', async () => {
    vi.useFakeTimers()
    const { client } = setup()
    const send = vi.fn(
      (_route, signal: AbortSignal) =>
        new Promise<object>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        }),
    )
    const promise = expect(client.request('/comment/1', 'GET', send)).rejects.toThrow(
      '接口请求超时',
    )
    await vi.advanceTimersByTimeAsync(18_000)
    await promise
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('主动取消主线路时立即结束，不发送备用且不上报异常', async () => {
    const { client, observer } = setup()
    const external = new AbortController()
    const send = vi.fn(
      (_route, signal: AbortSignal) =>
        new Promise<object>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        }),
    )
    const promise = client.request('/match', 'POST', send, { signal: external.signal })
    external.abort()
    await expect(promise).rejects.toThrow()
    expect(send).toHaveBeenCalledTimes(1)
    expect(observer.failed).not.toHaveBeenCalled()
    expect(observer.completed.mock.calls[0][0].result).toBe('cancelled')
  })

  it('已经取消的请求不发送任何网络尝试', async () => {
    const { client } = setup()
    const external = new AbortController()
    external.abort()
    const send = vi.fn()
    await expect(
      client.request('/match', 'POST', send, { signal: external.signal }),
    ).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
  })

  it('设置变化不取消当前请求，迟到结果不能覆盖用户选择', async () => {
    const { client } = setup()
    const pending = deferred<object>()
    const send = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue({ success: true })
    const first = client.request('/match', 'POST', send)
    client.setMode('cloudflare')
    pending.reject(new TypeError('Failed to fetch'))
    await first
    expect(send.mock.calls.map((call) => call[0])).toEqual(['cloudflare', 'edgeone'])
    expect(client.getPreferred()).toBe('cloudflare')
    await client.request('/match', 'POST', send)
    expect(send.mock.calls[2][0]).toBe('cloudflare')
  })

  it('并发请求的旧主线路成功不能覆盖较新的降级记忆', async () => {
    const { client } = setup()
    const pending = deferred<object>()
    const old = client.request('/match', 'POST', () => pending.promise)
    await client.request(
      '/comment/1',
      'GET',
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValue({ success: true }),
    )
    pending.resolve({ success: true })
    await old
    expect(client.getPreferred()).toBe('edgeone')
  })

  it('备用记忆期间故障可回到主线路，并立即清除旧冷却', async () => {
    const { client } = setup()
    await client.request(
      '/match',
      'POST',
      vi.fn().mockRejectedValueOnce(httpError(502)).mockResolvedValue({ success: true }),
    )
    await client.request(
      '/comment/1',
      'GET',
      vi.fn().mockRejectedValueOnce(httpError(502)).mockResolvedValue({ success: true }),
    )
    expect(client.getPreferred()).toBe('cloudflare')
  })

  it('遥测或订阅抛错不影响请求结果', async () => {
    const { client, observer } = setup()
    observer.completed.mockImplementation(() => {
      throw new Error('遥测离线')
    })
    observer.changed.mockImplementation(() => {
      throw new Error('遥测离线')
    })
    client.subscribe(() => {
      throw new Error('订阅失败')
    })
    await expect(
      client.request(
        '/match',
        'POST',
        vi.fn().mockRejectedValueOnce(httpError(502)).mockResolvedValue({ success: true }),
      ),
    ).resolves.toEqual({ success: true })
  })

  it('旧设置和无效模式归一为自动', () => {
    expect(normalizeApiRouteMode(undefined)).toBe('auto')
    expect(normalizeApiRouteMode('unknown')).toBe('auto')
    expect(normalizeApiRouteMode('edgeone')).toBe('edgeone')
  })
})
