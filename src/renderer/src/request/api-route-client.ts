/** 线路身份与具体地址分离；地址由构建环境配置，主备规则保持稳定。 */
export type ApiRoute = 'cloudflare' | 'edgeone'
export type ApiRouteMode = 'auto' | ApiRoute
const failedRequests = new WeakSet<object>()
export const isApiRequestFailure = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && failedRequests.has(error)
export type ApiEndpoint =
  'match' | 'comment' | 'search' | 'bangumi_detail' | 'bangumi_shin' | 'other'
export const normalizeApiRouteMode = (value: unknown): ApiRouteMode =>
  value === 'cloudflare' || value === 'edgeone' ? value : 'auto'

export interface ApiAttempt {
  attempt_id: string
  route: ApiRoute
  result: 'success' | 'failed' | 'cancelled'
  duration_ms: number
  http_status?: number
  error_code?: 'network_error' | 'timeout' | 'http_error' | 'business_error' | 'cancelled'
}

export interface ApiRequestResult {
  request_id: string
  operation_id?: string
  endpoint: ApiEndpoint
  mode: ApiRouteMode
  first_route: ApiRoute
  final_route: ApiRoute
  result: ApiAttempt['result']
  attempt_count: number
  duration_ms: number
  recovered: boolean
  http_status?: number
  error_code?: ApiAttempt['error_code']
  attempts: ApiAttempt[]
}

export interface ApiRouteChange {
  from: ApiRoute
  to: ApiRoute
  reason: 'manual' | 'failover' | 'primary_recovered' | 'cooldown_expired'
  mode: ApiRouteMode
  request_id?: string
}

export const classifyApiEndpoint = (path: string): ApiEndpoint => {
  const normalized = path.replace(/^\//, '')
  if (normalized === 'match') return 'match'
  if (normalized.startsWith('comment/')) return 'comment'
  if (normalized.startsWith('search/')) return 'search'
  if (normalized === 'bangumi/shin') return 'bangumi_shin'
  if (normalized.startsWith('bangumi/')) return 'bangumi_detail'
  return 'other'
}

export interface ApiRouteObserver {
  changed: (change: ApiRouteChange) => void
  completed: (result: ApiRequestResult) => void
  recovered: (error: unknown) => void
  failed: (error: unknown, result: ApiRequestResult) => void
}

/** 每轮固定模式快照；后续设置或并发请求只能影响下一轮。 */
export class ApiRouteClient {
  private mode: ApiRouteMode
  private preferred: ApiRoute
  private revision = 0
  private cooldown?: ReturnType<typeof setTimeout>
  private listeners = new Set<() => void>()

  constructor(
    mode: ApiRouteMode = 'auto',
    private readonly observer?: ApiRouteObserver,
  ) {
    this.mode = mode
    this.preferred = mode === 'edgeone' ? 'edgeone' : 'cloudflare'
  }

  getPreferred = (): ApiRoute => this.preferred

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setMode(mode: ApiRouteMode) {
    if (mode === this.mode) return
    this.mode = mode
    this.revision++
    clearTimeout(this.cooldown)
    this.change(mode === 'edgeone' ? 'edgeone' : 'cloudflare', 'manual')
  }

  private safely(run: () => void) {
    // 遥测与 UI 订阅失败都不能改变请求结果。
    try {
      run()
    } catch {
      /* 业务继续 */
    }
  }

  private change(to: ApiRoute, reason: ApiRouteChange['reason'], requestId?: string) {
    const from = this.preferred
    this.preferred = to
    if (from === to) return
    this.safely(() =>
      this.observer?.changed({ from, to, reason, mode: this.mode, request_id: requestId }),
    )
    for (const listener of this.listeners) this.safely(listener)
  }

  private remember(route: ApiRoute, revision: number, requestId: string) {
    if (revision !== this.revision || this.mode !== 'auto' || route === this.preferred) return
    this.revision++
    clearTimeout(this.cooldown)
    this.change(route, route === 'edgeone' ? 'failover' : 'primary_recovered', requestId)
    if (route === 'edgeone') {
      this.cooldown = setTimeout(() => {
        this.revision++
        this.change('cloudflare', 'cooldown_expired')
      }, 5 * 60_000)
    }
  }

  dispose() {
    clearTimeout(this.cooldown)
    this.listeners.clear()
  }

  async request<T>(
    path: string,
    method: 'GET' | 'POST' | 'DELETE',
    send: (route: ApiRoute, signal: AbortSignal) => Promise<T>,
    control?: { signal?: AbortSignal; operationId?: string },
  ): Promise<T> {
    const mode = this.mode
    const revision = this.revision
    const first = this.preferred
    const requestId = crypto.randomUUID()
    const started = performance.now()
    const attempts: ApiAttempt[] = []
    const endpoint = classifyApiEndpoint(path)
    // 只允许读请求以及明确无写入副作用的匹配 POST 重放。
    const canReplay = method === 'GET' || (method === 'POST' && endpoint === 'match')
    const routes: ApiRoute[] =
      mode === 'auto' && canReplay
        ? [first, first === 'cloudflare' ? 'edgeone' : 'cloudflare']
        : [first]
    let previousError: unknown
    let finalResult: ApiAttempt['result'] = 'failed'
    let recovered = false
    let terminalError: unknown
    try {
      for (const route of routes) {
        control?.signal?.throwIfAborted()
        const attemptStarted = performance.now()
        const controller = new AbortController()
        let timedOut = false
        const abort = () => controller.abort(control?.signal?.reason)
        control?.signal?.addEventListener('abort', abort, { once: true })
        const timer = setTimeout(
          () => {
            timedOut = true
            controller.abort(new DOMException('接口请求超时', 'TimeoutError'))
          },
          route === 'cloudflare' ? 8_000 : 10_000,
        )
        const attempt: ApiAttempt = {
          attempt_id: crypto.randomUUID(),
          route,
          result: 'failed',
          duration_ms: 0,
        }
        attempts.push(attempt)
        try {
          const data = await send(route, controller.signal)
          control?.signal?.throwIfAborted()
          if (timedOut) throw controller.signal.reason
          const body = data as { success?: boolean; errorCode?: number } | null
          const businessFailed = body?.success === false || Boolean(body?.errorCode)
          attempt.http_status = 200
          attempt.result = businessFailed ? 'failed' : 'success'
          if (businessFailed) attempt.error_code = 'business_error'
          finalResult = attempt.result
          if (!businessFailed) {
            this.remember(route, revision, requestId)
            recovered = attempts.length > 1
            if (recovered) this.safely(() => this.observer?.recovered(previousError))
          }
          // HTTP 200 的业务失败交给原 API adapter，不切线路、不改变业务返回契约。
          return data
        } catch (error) {
          previousError = error
          const status = (error as { response?: { status?: number } })?.response?.status
          attempt.http_status = status
          const cancelled = Boolean(control?.signal?.aborted)
          attempt.result = cancelled ? 'cancelled' : 'failed'
          attempt.error_code = cancelled
            ? 'cancelled'
            : timedOut
              ? 'timeout'
              : status
                ? 'http_error'
                : 'network_error'
          finalResult = attempt.result
          if (cancelled || !(timedOut || !status || status === 408 || status >= 500)) throw error
          // 最后一次失败由既有业务边界处理，不能吞掉或返回空数据。
          if (route === routes.at(-1)) throw error
        } finally {
          clearTimeout(timer)
          control?.signal?.removeEventListener('abort', abort)
          attempt.duration_ms = Math.round(performance.now() - attemptStarted)
        }
      }
      throw previousError
    } catch (error) {
      if (control?.signal?.aborted) finalResult = 'cancelled'
      else {
        terminalError = error
        if (typeof error === 'object' && error !== null) failedRequests.add(error)
      }
      throw error
    } finally {
      const result: ApiRequestResult = {
        request_id: requestId,
        operation_id: control?.operationId,
        endpoint,
        mode,
        first_route: first,
        final_route: attempts.at(-1)?.route ?? first,
        result: finalResult,
        attempt_count: attempts.length,
        duration_ms: Math.round(performance.now() - started),
        recovered,
        attempts,
        http_status: attempts.at(-1)?.http_status,
        error_code: attempts.at(-1)?.error_code,
      }
      this.safely(() => this.observer?.completed(result))
      if (finalResult === 'failed' && terminalError) {
        this.safely(() => this.observer?.failed(terminalError, result))
      }
    }
  }
}
