import type {
  ApiRoute,
  ApiRouteClientOptions,
  ApiRouteMode,
  RoutePreferenceStore,
  StoredRoutePreference,
} from '@renderer/request/api-route-client'
import {
  ApiRouteClient,
  attemptTimeoutMs,
  hedgeDelayMs,
  isApiRequestFailure,
  isMainlandTimeZone,
  normalizeApiRouteMode,
  ROUTE_PREFERENCE_REFRESH_MS,
  ROUTE_PREFERENCE_TTL_MS,
} from '@renderer/request/api-route-client'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Send = (route: ApiRoute, signal: AbortSignal) => Promise<object>

const NOW = new Date('2026-11-10T12:00:00+08:00').getTime()
const clients: ApiRouteClient[] = []

/** 可观察的内存存储：记录每次写入 */
const memoryStore = (initial: StoredRoutePreference | null = null) => {
  let value = initial
  const store = {
    load: vi.fn(() => value),
    save: vi.fn((preference: StoredRoutePreference) => {
      value = preference
    }),
  } satisfies RoutePreferenceStore
  return store
}

const setup = (
  mode: ApiRouteMode = 'auto',
  options: ApiRouteClientOptions & { store?: ReturnType<typeof memoryStore> } = {},
) => {
  const observer = { changed: vi.fn(), completed: vi.fn(), recovered: vi.fn(), failed: vi.fn() }
  const store = options.store ?? memoryStore()
  const client = new ApiRouteClient(mode, observer, { ...options, store })
  clients.push(client)
  return { client, observer, store }
}

const fakeTimers = () => vi.useFakeTimers({ now: NOW })

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

/** 一直挂起，直到线路层中止 */
const hang: Send = (_route, signal) =>
  new Promise<object>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })

/** 经过 ms 后成功或失败；被中止时立即以中止原因失败 */
const after =
  (ms: number, outcome: { value?: object; error?: unknown } = { value: { success: true } }): Send =>
  (_route, signal) =>
    new Promise<object>((resolve, reject) => {
      const timer = setTimeout(() => {
        if ('error' in outcome) reject(outcome.error)
        else resolve(outcome.value ?? {})
      }, ms)
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(signal.reason)
        },
        { once: true },
      )
    })

/** 按线路分派不同行为 */
const byRoute = (impl: Record<ApiRoute, Send>) =>
  vi.fn<Send>((route, signal) => impl[route](route, signal))

const routesOf = (send: ReturnType<typeof vi.fn>) => send.mock.calls.map((call) => call[0])
const summaryOf = (observer: ReturnType<typeof setup>['observer']) =>
  observer.completed.mock.calls[0][0]

afterEach(() => {
  clients.splice(0).forEach((client) => client.dispose())
  vi.useRealTimers()
})

describe('接口线路：基本行为', () => {
  it('首选线路及时返回时只请求一次，完成事件保留操作关联', async () => {
    const { client, observer } = setup()
    const send = vi.fn().mockResolvedValue({ success: true })
    await client.request('/match', 'POST', send, { operationId: 'load-1' })
    expect(routesOf(send)).toEqual(['cloudflare'])
    expect(observer.completed).toHaveBeenCalledWith(
      expect.objectContaining({
        operation_id: 'load-1',
        endpoint: 'match',
        result: 'success',
        attempt_count: 1,
        recovered: false,
        hedged: false,
        first_route_source: 'default',
        attempts: [
          expect.objectContaining({
            route: 'cloudflare',
            trigger: 'initial',
            started_at_ms: 0,
            result: 'success',
          }),
        ],
      }),
    )
  })

  it.each([408, 500, 502, 503, 504, 545])(
    '状态码 %i 立即降级到另一线路并记住它',
    async (status) => {
      const { client, observer, store } = setup()
      const send = vi
        .fn()
        .mockRejectedValueOnce(httpError(status))
        .mockResolvedValueOnce({ success: true })
      await client.request('/match', 'POST', send)
      expect(routesOf(send)).toEqual(['cloudflare', 'edgeone'])
      expect(client.getPreferred()).toBe('edgeone')
      expect(client.getPreferredSource()).toBe('learned')
      expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ route: 'edgeone' }))
      expect(observer.changed).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'cloudflare', to: 'edgeone', reason: 'failover' }),
      )
      expect(summaryOf(observer)).toEqual(
        expect.objectContaining({ result: 'success', recovered: true, hedged: false }),
      )
      expect(summaryOf(observer).attempts[1].trigger).toBe('failover')
      expect(observer.recovered).toHaveBeenCalledTimes(1)
      expect(observer.failed).not.toHaveBeenCalled()
    },
  )

  it.each([400, 401, 403, 404, 409, 429])('状态码 %i 不切换线路也不学习', async (status) => {
    const { client, store } = setup()
    const send = vi.fn().mockRejectedValue(httpError(status))
    await expect(client.request('/match', 'POST', send)).rejects.toThrow()
    expect(send).toHaveBeenCalledTimes(1)
    expect(client.getPreferred()).toBe('cloudflare')
    expect(store.save).not.toHaveBeenCalled()
  })

  it('两条线路都失败时以最后的错误失败，只上报一次并阻止 Query 再重试', async () => {
    const { client, observer, store } = setup()
    const last = new TypeError('Failed to fetch')
    const send = vi.fn().mockRejectedValueOnce(httpError(502)).mockRejectedValueOnce(last)
    await expect(client.request('/comment/1', 'GET', send)).rejects.toBe(last)
    expect(send).toHaveBeenCalledTimes(2)
    expect(client.getPreferred()).toBe('cloudflare')
    expect(store.save).not.toHaveBeenCalled()
    expect(observer.failed).toHaveBeenCalledTimes(1)
    expect(summaryOf(observer)).toEqual(
      expect.objectContaining({
        result: 'failed',
        recovered: false,
        final_route: 'edgeone',
        error_code: 'network_error',
      }),
    )
    expect(isApiRequestFailure(last)).toBe(true)
  })

  it.each([
    { success: false, errorCode: 100 },
    { success: true, isMatched: false },
    { count: 0, comments: [] },
  ])('有效业务响应原样返回，不切换线路：%j', async (data) => {
    const { client, observer } = setup()
    const send = vi.fn().mockResolvedValue(data)
    await expect(client.request('/match', 'POST', send)).resolves.toEqual(data)
    expect(send).toHaveBeenCalledTimes(1)
    expect(summaryOf(observer).result).toBe(data.success === false ? 'failed' : 'success')
    expect(observer.failed).not.toHaveBeenCalled()
  })

  it('遥测、订阅或存储抛错不影响请求结果', async () => {
    const store = memoryStore()
    store.save.mockImplementation(() => {
      throw new Error('存储已满')
    })
    const { client, observer } = setup('auto', { store })
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
    // 写入失败时学习结果只在内存中生效
    expect(client.getPreferred()).toBe('edgeone')
  })

  it('旧设置和无效模式归一为自动', () => {
    expect(normalizeApiRouteMode(undefined)).toBe('auto')
    expect(normalizeApiRouteMode('unknown')).toBe('auto')
    expect(normalizeApiRouteMode('edgeone')).toBe('edgeone')
  })
})

describe('接口线路：对冲', () => {
  it('对冲延迟与单次超时只按接口区分', () => {
    expect(hedgeDelayMs('comment')).toBe(2_500)
    expect(hedgeDelayMs('match')).toBe(1_500)
    expect(hedgeDelayMs('bangumi_detail')).toBe(1_500)
    expect(attemptTimeoutMs('comment')).toBe(25_000)
    expect(attemptTimeoutMs('match')).toBe(15_000)
    expect(attemptTimeoutMs('search')).toBe(10_000)
    expect(attemptTimeoutMs('bangumi_shin')).toBe(10_000)
  })

  it('首选线路超过 1.5 秒仍未返回时对冲，另一条先到即胜出', async () => {
    fakeTimers()
    const { client, observer, store } = setup()
    const send = byRoute({ cloudflare: hang, edgeone: after(200) })
    const promise = client.request('/match', 'POST', send)
    await vi.advanceTimersByTimeAsync(1_499)
    expect(send).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(routesOf(send)).toEqual(['cloudflare', 'edgeone'])
    await vi.advanceTimersByTimeAsync(200)
    await expect(promise).resolves.toEqual({ success: true })

    // 首选线路的信号已被中止，不再占用连接
    expect(send.mock.calls[0][1].aborted).toBe(true)
    const summary = summaryOf(observer)
    expect(summary).toEqual(
      expect.objectContaining({
        result: 'success',
        hedged: true,
        recovered: false,
        final_route: 'edgeone',
        attempt_count: 2,
        http_status: 200,
      }),
    )
    expect(summary.attempts).toEqual([
      expect.objectContaining({
        route: 'cloudflare',
        trigger: 'initial',
        result: 'superseded',
        error_code: 'superseded',
        duration_ms: 1_700,
      }),
      expect.objectContaining({
        route: 'edgeone',
        trigger: 'hedge',
        started_at_ms: 1_500,
        result: 'success',
        duration_ms: 200,
      }),
    ])
    // 只是慢，不是故障：不上报"已恢复"
    expect(observer.recovered).not.toHaveBeenCalled()
    expect(observer.changed).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'cloudflare', to: 'edgeone', reason: 'hedge' }),
    )
    expect(client.getPreferred()).toBe('edgeone')
    expect(store.save).toHaveBeenCalledWith({ route: 'edgeone', updatedAt: NOW + 1_700 })
  })

  it('对冲后首选线路仍先返回时保留首选，并写入学习记录', async () => {
    fakeTimers()
    const { client, observer, store } = setup()
    const send = byRoute({ cloudflare: after(1_800), edgeone: after(5_000) })
    const promise = client.request('/match', 'POST', send)
    await vi.advanceTimersByTimeAsync(1_800)
    await promise
    expect(summaryOf(observer).attempts.map((a: { result: string }) => a.result)).toEqual([
      'success',
      'superseded',
    ])
    expect(client.getPreferred()).toBe('cloudflare')
    expect(client.getPreferredSource()).toBe('learned')
    expect(observer.changed).not.toHaveBeenCalled()
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ route: 'cloudflare' }))
  })

  it('获取弹幕的对冲延迟为 2.5 秒', async () => {
    fakeTimers()
    const { client } = setup()
    const send = byRoute({ cloudflare: after(2_000), edgeone: after(0) })
    const promise = client.request('/comment/1', 'GET', send)
    await vi.advanceTimersByTimeAsync(2_000)
    await promise
    expect(routesOf(send)).toEqual(['cloudflare'])
  })

  it('首选线路在对冲前失败时立即请求另一条线路', async () => {
    fakeTimers()
    const { client, observer } = setup()
    const send = byRoute({
      cloudflare: after(300, { error: new TypeError('Failed to fetch') }),
      edgeone: after(100),
    })
    const promise = client.request('/match', 'POST', send)
    await vi.advanceTimersByTimeAsync(300)
    expect(routesOf(send)).toEqual(['cloudflare', 'edgeone'])
    await vi.advanceTimersByTimeAsync(100)
    await promise
    expect(summaryOf(observer).attempts[1]).toEqual(
      expect.objectContaining({ trigger: 'failover', started_at_ms: 300 }),
    )
    // 失败后才降级，没有并行：不算对冲，也不会再发第三次
    expect(summaryOf(observer).hedged).toBe(false)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('对冲后一条线路失败时继续等待另一条', async () => {
    fakeTimers()
    const { client, observer } = setup()
    const send = byRoute({
      cloudflare: after(3_000),
      edgeone: after(100, { error: httpError(502) }),
    })
    const promise = client.request('/match', 'POST', send)
    await vi.advanceTimersByTimeAsync(1_600)
    expect(observer.completed).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_400)
    await expect(promise).resolves.toEqual({ success: true })
    expect(summaryOf(observer)).toEqual(
      expect.objectContaining({ result: 'success', final_route: 'cloudflare' }),
    )
    expect(summaryOf(observer).attempts[1]).toEqual(
      expect.objectContaining({ route: 'edgeone', result: 'failed', http_status: 502 }),
    )
  })

  it('对冲后一条线路返回 401 时立即结束本轮，不学习', async () => {
    fakeTimers()
    const { client, observer, store } = setup()
    const send = byRoute({ cloudflare: hang, edgeone: after(100, { error: httpError(401) }) })
    const promise = expect(client.request('/match', 'POST', send)).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(1_600)
    await promise
    expect(summaryOf(observer)).toEqual(
      expect.objectContaining({ result: 'failed', http_status: 401, error_code: 'http_error' }),
    )
    expect(summaryOf(observer).attempts[0].result).toBe('superseded')
    expect(store.save).not.toHaveBeenCalled()
    expect(client.getPreferred()).toBe('cloudflare')
  })

  it('两条线路都超时后整轮失败，没有第三次尝试', async () => {
    fakeTimers()
    const { client, observer } = setup()
    const send = vi.fn(hang)
    const promise = expect(client.request('/match', 'POST', send)).rejects.toThrow('接口请求超时')
    await vi.advanceTimersByTimeAsync(15_000)
    // 首选线路已超时，对冲出去的 EdgeOne 还剩 1.5 秒
    expect(observer.completed).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_500)
    await promise
    expect(send).toHaveBeenCalledTimes(2)
    expect(observer.failed).toHaveBeenCalledTimes(1)
    expect(summaryOf(observer).attempts).toEqual([
      expect.objectContaining({ route: 'cloudflare', error_code: 'timeout' }),
      expect.objectContaining({ route: 'edgeone', error_code: 'timeout' }),
    ])
  })

  it('不可重放的写请求不对冲也不降级', async () => {
    fakeTimers()
    const { client } = setup()
    const send = vi.fn(hang)
    const promise = expect(client.request('/unknown', 'POST', send)).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(10_000)
    await promise
    expect(send).toHaveBeenCalledTimes(1)
  })

  it.each(['cloudflare', 'edgeone'] as const)(
    '手动 %s 很慢也不对冲，失败也不降级',
    async (mode) => {
      fakeTimers()
      const { client } = setup(mode)
      const send = vi.fn(after(5_000, { error: new TypeError('Failed to fetch') }))
      const promise = expect(client.request('/match', 'POST', send)).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(5_000)
      await promise
      expect(routesOf(send)).toEqual([mode])
    },
  )

  it('手动模式获取弹幕 20 秒的慢响应仍可成功', async () => {
    fakeTimers()
    const { client } = setup('edgeone')
    const send = vi.fn(after(20_000, { value: { count: 0, comments: [] } }))
    const promise = client.request('/comment/1', 'GET', send)
    await vi.advanceTimersByTimeAsync(20_000)
    await expect(promise).resolves.toEqual({ count: 0, comments: [] })
  })

  it('其他接口 10 秒超时', async () => {
    fakeTimers()
    const { client } = setup('cloudflare')
    const promise = expect(client.request('/bangumi/1', 'GET', vi.fn(hang))).rejects.toThrow(
      '接口请求超时',
    )
    await vi.advanceTimersByTimeAsync(10_000)
    await promise
  })
})

describe('接口线路：取消', () => {
  it('主动取消时立即结束，不发送备用且不上报异常', async () => {
    const { client, observer } = setup()
    const external = new AbortController()
    const send = vi.fn(hang)
    const promise = client.request('/match', 'POST', send, { signal: external.signal })
    external.abort()
    await expect(promise).rejects.toThrow()
    expect(send).toHaveBeenCalledTimes(1)
    expect(observer.failed).not.toHaveBeenCalled()
    expect(summaryOf(observer).result).toBe('cancelled')
  })

  it('对冲期间取消时两次尝试都被取消，不学习也不上报', async () => {
    fakeTimers()
    const { client, observer, store } = setup()
    const external = new AbortController()
    const send = vi.fn(hang)
    const promise = client.request('/match', 'POST', send, { signal: external.signal })
    const settled = expect(promise).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(2_000)
    external.abort()
    await settled
    expect(send.mock.calls.every((call) => call[1].aborted)).toBe(true)
    expect(summaryOf(observer).result).toBe('cancelled')
    expect(summaryOf(observer).attempts.map((a: { result: string }) => a.result)).toEqual([
      'cancelled',
      'cancelled',
    ])
    expect(observer.failed).not.toHaveBeenCalled()
    expect(store.save).not.toHaveBeenCalled()
    // 之后不会再发起任何尝试
    await vi.advanceTimersByTimeAsync(20_000)
    expect(send).toHaveBeenCalledTimes(2)
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

  it('外部 signal 不会因单次超时被中止，每次尝试有独立的 signal', async () => {
    fakeTimers()
    const { client } = setup()
    const external = new AbortController()
    const send = byRoute({ cloudflare: hang, edgeone: after(100) })
    const promise = client.request('/match', 'POST', send, { signal: external.signal })
    await vi.advanceTimersByTimeAsync(1_600)
    await promise
    expect(external.signal.aborted).toBe(false)
    expect(send.mock.calls[0][1]).not.toBe(send.mock.calls[1][1])
  })
})

describe('接口线路：首选线路的来源与学习', () => {
  it('时区先验：大陆时区先走 EdgeOne，港澳台与其他时区先走 Cloudflare', () => {
    for (const timeZone of ['Asia/Shanghai', 'Asia/Urumqi', 'PRC']) {
      const { client } = setup('auto', { timeZone: () => timeZone })
      expect([client.getPreferred(), client.getPreferredSource()]).toEqual(['edgeone', 'timezone'])
    }
    for (const timeZone of ['Asia/Hong_Kong', 'Asia/Macau', 'Asia/Taipei', 'Asia/Tokyo']) {
      const { client } = setup('auto', { timeZone: () => timeZone })
      expect([client.getPreferred(), client.getPreferredSource()]).toEqual([
        'cloudflare',
        'default',
      ])
    }
    expect(isMainlandTimeZone(undefined)).toBe(false)
  })

  it('大陆时区的首轮请求先走 EdgeOne，并在遥测中标注来源', async () => {
    const { client, observer } = setup('auto', { timeZone: () => 'Asia/Shanghai' })
    const send = vi.fn().mockResolvedValue({ success: true })
    await client.request('/match', 'POST', send)
    expect(routesOf(send)).toEqual(['edgeone'])
    expect(summaryOf(observer).first_route_source).toBe('timezone')
  })

  it('未过期的学习记录优先于时区，启动恢复不发线路变化事件', () => {
    const store = memoryStore({ route: 'cloudflare', updatedAt: Date.now() - 3 * 86_400_000 })
    const { client, observer } = setup('auto', { store, timeZone: () => 'Asia/Shanghai' })
    expect([client.getPreferred(), client.getPreferredSource()]).toEqual(['cloudflare', 'learned'])
    expect(observer.changed).not.toHaveBeenCalled()
  })

  it('过期或无效的学习记录视为不存在', () => {
    const stale = memoryStore({
      route: 'cloudflare',
      updatedAt: Date.now() - ROUTE_PREFERENCE_TTL_MS - 1,
    })
    expect(
      setup('auto', { store: stale, timeZone: () => 'Asia/Shanghai' }).client.getPreferredSource(),
    ).toBe('timezone')
    const invalid = memoryStore({ route: 'unknown' as ApiRoute, updatedAt: Date.now() })
    expect(setup('auto', { store: invalid }).client.getPreferredSource()).toBe('default')
  })

  it('读取存储或时区抛错时回退为 Cloudflare', async () => {
    const store = memoryStore()
    store.load.mockImplementation(() => {
      throw new Error('存储不可用')
    })
    const { client } = setup('auto', {
      store,
      timeZone: () => {
        throw new Error('Intl 不可用')
      },
    })
    expect([client.getPreferred(), client.getPreferredSource()]).toEqual(['cloudflare', 'default'])
    await expect(
      client.request('/match', 'POST', vi.fn().mockResolvedValue({ success: true })),
    ).resolves.toEqual({ success: true })
  })

  it('只请求了一条线路的轮次不写入学习记录', async () => {
    const { client, store } = setup('auto', { timeZone: () => 'Asia/Shanghai' })
    await client.request('/match', 'POST', vi.fn().mockResolvedValue({ success: true }))
    expect(store.save).not.toHaveBeenCalled()
    expect(client.getPreferredSource()).toBe('timezone')
  })

  it('持续可用的学习记录续期，1 小时内最多写一次', async () => {
    fakeTimers()
    const store = memoryStore({ route: 'edgeone', updatedAt: NOW - 6 * 86_400_000 })
    const { client } = setup('auto', { store })
    const send = vi.fn().mockResolvedValue({ success: true })
    await client.request('/match', 'POST', send)
    expect(store.save).toHaveBeenCalledTimes(1)
    expect(store.save).toHaveBeenLastCalledWith({ route: 'edgeone', updatedAt: NOW })
    await vi.advanceTimersByTimeAsync(ROUTE_PREFERENCE_REFRESH_MS - 1)
    await client.request('/match', 'POST', send)
    expect(store.save).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await client.request('/match', 'POST', send)
    expect(store.save).toHaveBeenCalledTimes(2)
  })

  it('学到的线路不会因时间流逝被切回 Cloudflare', async () => {
    fakeTimers()
    const { client } = setup()
    await client.request(
      '/match',
      'POST',
      vi.fn().mockRejectedValueOnce(httpError(502)).mockResolvedValue({ success: true }),
    )
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    const send = vi.fn().mockResolvedValue({ success: true })
    await client.request('/match', 'POST', send)
    expect(routesOf(send)).toEqual(['edgeone'])
  })

  it('学到的线路变慢时可被对冲纠正回另一条', async () => {
    fakeTimers()
    const store = memoryStore({ route: 'edgeone', updatedAt: NOW })
    const { client, observer } = setup('auto', { store })
    const send = byRoute({ cloudflare: after(100), edgeone: hang })
    const promise = client.request('/match', 'POST', send)
    await vi.advanceTimersByTimeAsync(1_600)
    await promise
    expect(client.getPreferred()).toBe('cloudflare')
    expect(observer.changed).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'edgeone', to: 'cloudflare', reason: 'hedge' }),
    )
  })

  it('手动模式不读写学习记录，切回自动后沿用学习结果', async () => {
    const store = memoryStore({ route: 'edgeone', updatedAt: Date.now() })
    const { client, observer } = setup('auto', { store })
    client.setMode('cloudflare')
    expect(client.getPreferredSource()).toBe('manual')
    await client
      .request(
        '/match',
        'POST',
        vi.fn().mockRejectedValueOnce(httpError(502)).mockResolvedValue({ success: true }),
      )
      .catch(() => {})
    expect(store.save).not.toHaveBeenCalled()
    client.setMode('auto')
    expect([client.getPreferred(), client.getPreferredSource()]).toEqual(['edgeone', 'learned'])
    expect(observer.changed.mock.calls.map((call) => call[0].reason)).toEqual(['manual', 'manual'])
  })

  it('设置变化不取消当前请求，迟到的对冲结果不覆盖用户选择', async () => {
    fakeTimers()
    const { client, store } = setup()
    const send = byRoute({ cloudflare: hang, edgeone: after(100) })
    const promise = client.request('/match', 'POST', send)
    client.setMode('cloudflare')
    await vi.advanceTimersByTimeAsync(1_600)
    await expect(promise).resolves.toEqual({ success: true })
    expect(routesOf(send)).toEqual(['cloudflare', 'edgeone'])
    expect(client.getPreferred()).toBe('cloudflare')
    expect(store.save).not.toHaveBeenCalled()
  })

  it('较早轮次迟到的结果不覆盖较新的学习结果', async () => {
    const { client } = setup()
    const pending = deferred<object>()
    const old = client.request('/match', 'POST', () => pending.promise)
    await client.request(
      '/comment/1',
      'GET',
      vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue({}),
    )
    expect(client.getPreferred()).toBe('edgeone')
    pending.resolve({ success: true })
    await old
    expect(client.getPreferred()).toBe('edgeone')
  })
})
