/** 线路身份与具体地址分离；地址由构建环境配置，调度规则与地址无关。 */
export type ApiRoute = 'cloudflare' | 'edgeone'
export type ApiRouteMode = 'auto' | ApiRoute
/** 首选线路从哪里来：实测学习、时区先验、默认，或用户手动指定 */
export type ApiRouteSource = 'learned' | 'timezone' | 'default' | 'manual'
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
  /** initial：本轮首发；hedge：首选线路超过对冲延迟后并行发出；failover：首选线路提前失败后发出 */
  trigger: 'initial' | 'hedge' | 'failover'
  /** 相对本轮开始的发起时刻；对冲后两次尝试会并行，单看耗时还原不出时间线 */
  started_at_ms: number
  /** superseded：另一条线路先给出结果，本次尝试被取消，不算线路故障 */
  result: 'success' | 'failed' | 'cancelled' | 'superseded'
  duration_ms: number
  http_status?: number
  error_code?:
    'network_error' | 'timeout' | 'http_error' | 'business_error' | 'cancelled' | 'superseded'
}

export interface ApiRequestResult {
  request_id: string
  operation_id?: string
  endpoint: ApiEndpoint
  mode: ApiRouteMode
  first_route: ApiRoute
  first_route_source: ApiRouteSource
  final_route: ApiRoute
  result: 'success' | 'failed' | 'cancelled'
  attempt_count: number
  duration_ms: number
  /** 首选线路真实失败后另一条线路成功；仅被对冲超过不算 */
  recovered: boolean
  /** 本轮是否因首选线路慢而并行请求了另一条线路 */
  hedged: boolean
  /** 取决定本轮结果的那次尝试；并行时最后发起的尝试未必是它 */
  http_status?: number
  error_code?: ApiAttempt['error_code']
  /** 按发起顺序 */
  attempts: ApiAttempt[]
}

export interface ApiRouteChange {
  from: ApiRoute
  to: ApiRoute
  /** manual：用户切换模式；hedge：对冲比较后切换；failover：首选线路真实失败后另一条成功 */
  reason: 'manual' | 'hedge' | 'failover'
  mode: ApiRouteMode
  request_id?: string
}

/** 实测学到的首选线路；只在同时比较过两条线路后写入 */
export interface StoredRoutePreference {
  route: ApiRoute
  updatedAt: number
}

/** 学习结果的持久化端口；读写失败时线路层降级为只在内存中生效 */
export interface RoutePreferenceStore {
  load: () => StoredRoutePreference | null
  save: (preference: StoredRoutePreference) => void
}

export interface ApiRouteClientOptions {
  store?: RoutePreferenceStore
  /** 系统 IANA 时区；读取不到返回 undefined */
  timeZone?: () => string | undefined
}

/** 学习记录有效期，自最后一次写入或刷新起算 */
export const ROUTE_PREFERENCE_TTL_MS = 7 * 24 * 60 * 60_000
/** 首选线路持续可用时刷新学习记录的最小间隔，限制写入频率 */
export const ROUTE_PREFERENCE_REFRESH_MS = 60 * 60_000

/** 中国大陆的 IANA 时区（含历史别名）；港澳台直连 Cloudflare 本来就快，不在其中 */
const MAINLAND_TIME_ZONES = new Set([
  'Asia/Shanghai',
  'Asia/Chongqing',
  'Asia/Chungking',
  'Asia/Harbin',
  'Asia/Urumqi',
  'Asia/Kashgar',
  'PRC',
])
export const isMainlandTimeZone = (timeZone: string | undefined) =>
  timeZone !== undefined && MAINLAND_TIME_ZONES.has(timeZone)

const isRoute = (value: unknown): value is ApiRoute => value === 'cloudflare' || value === 'edgeone'

const otherRoute = (route: ApiRoute): ApiRoute =>
  route === 'cloudflare' ? 'edgeone' : 'cloudflare'

export const classifyApiEndpoint = (path: string): ApiEndpoint => {
  const normalized = path.replace(/^\//, '')
  if (normalized === 'match') return 'match'
  if (normalized.startsWith('comment/')) return 'comment'
  if (normalized.startsWith('search/')) return 'search'
  if (normalized === 'bangumi/shin') return 'bangumi_shin'
  if (normalized.startsWith('bangumi/')) return 'bangumi_detail'
  return 'other'
}

/**
 * 首选线路超过这个时间仍未返回完整响应，就并行请求另一条线路。
 * 计时覆盖整条链路（客户端到边缘、Worker 回源弹弹play、响应体下载）。
 * 低峰时上海直连 Cloudflare 的匹配约 1.3–2.0 秒，取 1.5 秒让慢线路尽早被对冲；
 * 获取弹幕在源站未命中缓存时，仅 Worker 回源就要 1.0–1.4 秒，因此放宽。
 */
export const hedgeDelayMs = (endpoint: ApiEndpoint) => (endpoint === 'comment' ? 2_500 : 1_500)

/**
 * 单次尝试的超时，与首发、对冲或降级无关。
 * 慢线路由对冲兜底，不再需要用短超时快速降级，这里只防止请求无限挂起，
 * 并给慢而有效的响应（尤其是需要服务端聚合第三方源的弹幕）留足时间。
 */
export const attemptTimeoutMs = (endpoint: ApiEndpoint) => {
  if (endpoint === 'comment') return 25_000
  if (endpoint === 'match') return 15_000
  return 10_000
}

/** 网络错误、超时、408 和 5xx 说明线路本身有问题，可以交给另一条线路 */
const isRetryableFailure = (timedOut: boolean, status: number | undefined) =>
  timedOut || !status || status === 408 || status >= 500

export interface ApiRouteObserver {
  changed: (change: ApiRouteChange) => void
  completed: (result: ApiRequestResult) => void
  recovered: (error: unknown) => void
  failed: (error: unknown, result: ApiRequestResult) => void
}

const memoryStore = (): RoutePreferenceStore => {
  let value: StoredRoutePreference | null = null
  return {
    load: () => value,
    save: (preference) => {
      value = preference
    },
  }
}

/**
 * 自动模式下按实测选择线路：首选线路慢就对冲到另一条，先返回者胜，并记住胜出的线路。
 * 每一轮在开始时对模式与首选线路做快照；之后的设置变化或并发请求只影响下一轮。
 */
export class ApiRouteClient {
  private mode: ApiRouteMode
  private preferred: ApiRoute
  private source: ApiRouteSource
  /** 设置切换或首选线路被学习改写时递增，用来丢弃较早轮次的迟到结果 */
  private revision = 0
  private stored: StoredRoutePreference | null = null
  private listeners = new Set<() => void>()
  private readonly store: RoutePreferenceStore
  private readonly timeZone: () => string | undefined

  constructor(
    mode: ApiRouteMode = 'auto',
    private readonly observer?: ApiRouteObserver,
    options: ApiRouteClientOptions = {},
  ) {
    this.store = options.store ?? memoryStore()
    this.timeZone = options.timeZone ?? (() => undefined)
    this.mode = mode
    // 启动时按学习记录或时区确定首选线路，不算线路变化，不发事件
    const initial = this.resolve(mode)
    this.preferred = initial.route
    this.source = initial.source
  }

  getPreferred = (): ApiRoute => this.preferred

  getPreferredSource = (): ApiRouteSource => this.source

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
    // 切回自动时重新按学习记录、时区、默认的顺序确定首选线路；手动模式不读写学习记录
    const next = this.resolve(mode)
    this.source = next.source
    this.change(next.route, 'manual')
  }

  private safely<T>(run: () => T): T | undefined {
    // 遥测、订阅与本地存储失败都不能改变请求结果。
    try {
      return run()
    } catch {
      return undefined
    }
  }

  private resolve(mode: ApiRouteMode): { route: ApiRoute; source: ApiRouteSource } {
    if (mode !== 'auto') return { route: mode, source: 'manual' }
    const record = this.safely(() => this.store.load())
    const age =
      record && isRoute(record.route) && Number.isFinite(record.updatedAt)
        ? Date.now() - record.updatedAt
        : Number.POSITIVE_INFINITY
    // 时间倒退很多的记录同样不可信，按过期处理
    if (record && Math.abs(age) < ROUTE_PREFERENCE_TTL_MS) {
      this.stored = { route: record.route, updatedAt: record.updatedAt }
      return { route: record.route, source: 'learned' }
    }
    this.stored = null
    if (isMainlandTimeZone(this.safely(() => this.timeZone()))) {
      return { route: 'edgeone', source: 'timezone' }
    }
    return { route: 'cloudflare', source: 'default' }
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

  private persist(route: ApiRoute) {
    const preference = { route, updatedAt: Date.now() }
    this.stored = preference
    this.safely(() => this.store.save(preference))
  }

  /** 两条线路都参与过的轮次：给出有效响应的线路成为首选，并写入学习记录 */
  private learn(
    route: ApiRoute,
    revision: number,
    reason: 'hedge' | 'failover',
    requestId: string,
  ) {
    if (revision !== this.revision || this.mode !== 'auto') return
    this.persist(route)
    this.source = 'learned'
    if (route === this.preferred) return
    this.revision++
    this.change(route, reason, requestId)
  }

  /** 只走了首选线路且成功：持续可用的学习记录续期，1 小时内最多写一次 */
  private refresh(route: ApiRoute, revision: number) {
    if (revision !== this.revision || this.mode !== 'auto' || this.source !== 'learned') return
    if (route !== this.preferred || !this.stored) return
    if (Date.now() - this.stored.updatedAt < ROUTE_PREFERENCE_REFRESH_MS) return
    this.persist(route)
  }

  dispose() {
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
    const firstSource = this.source
    const requestId = crypto.randomUUID()
    const started = performance.now()
    const endpoint = classifyApiEndpoint(path)
    // 只允许读请求以及明确无写入副作用的匹配 POST 重放；不可重放的请求不对冲也不降级。
    const canReplay = method === 'GET' || (method === 'POST' && endpoint === 'match')
    const allowSecond = mode === 'auto' && canReplay
    const external = control?.signal

    const attempts: ApiAttempt[] = []
    let hedged = false
    /** 决定本轮结果的尝试 */
    let decided: ApiAttempt | undefined
    /** 首选线路以可降级错误真实失败时的错误，用于区分"恢复"与"被对冲超过" */
    let primaryError: unknown
    let primaryFailed = false
    let terminalError: unknown
    let cancelled = false

    try {
      external?.throwIfAborted()
      return await new Promise<T>((resolve, reject) => {
        let settled = false
        let hedgeTimer: ReturnType<typeof setTimeout> | undefined
        /** 进行中的尝试；收尾时据此取消并标记 superseded / cancelled */
        const live = new Map<ApiAttempt, { controller: AbortController; begin: number }>()

        const close = (attempt: ApiAttempt) => {
          const entry = live.get(attempt)
          if (!entry) return
          live.delete(attempt)
          attempt.duration_ms = Math.round(performance.now() - entry.begin)
        }

        /** 结束本轮：其余进行中的尝试按原因标记后取消，迟到的回调全部忽略 */
        const settle = (outcome: 'superseded' | 'cancelled', reason: unknown, done: () => void) => {
          if (settled) return
          settled = true
          clearTimeout(hedgeTimer)
          external?.removeEventListener('abort', onAbort)
          for (const [attempt, { controller }] of [...live]) {
            close(attempt)
            attempt.result = outcome
            attempt.error_code = outcome
            controller.abort(reason)
          }
          done()
        }

        const onAbort = () => {
          cancelled = true
          settle('cancelled', external?.reason, () => reject(external?.reason))
        }
        external?.addEventListener('abort', onAbort, { once: true })

        const launch = (route: ApiRoute, trigger: ApiAttempt['trigger']) => {
          const controller = new AbortController()
          const begin = performance.now()
          const attempt: ApiAttempt = {
            attempt_id: crypto.randomUUID(),
            route,
            trigger,
            started_at_ms: Math.round(begin - started),
            result: 'failed',
            duration_ms: 0,
          }
          attempts.push(attempt)
          live.set(attempt, { controller, begin })
          let timedOut = false
          const timer = setTimeout(() => {
            timedOut = true
            controller.abort(new DOMException('接口请求超时', 'TimeoutError'))
          }, attemptTimeoutMs(endpoint))

          const onFailure = (error: unknown) => {
            clearTimeout(timer)
            if (settled) return
            close(attempt)
            const status = (error as { response?: { status?: number } })?.response?.status
            attempt.http_status = status
            attempt.result = 'failed'
            attempt.error_code = timedOut ? 'timeout' : status ? 'http_error' : 'network_error'
            if (!isRetryableFailure(timedOut, status)) {
              // 401 / 404 等与线路无关的拒绝：直接结束本轮，不切换线路
              decided = attempt
              settle('superseded', abortedBySibling(), () => reject(error))
              return
            }
            if (attempt.trigger === 'initial') {
              primaryFailed = true
              primaryError = error
            }
            // 首选线路在对冲之前就失败：不再等待，立即请求另一条线路
            if (allowSecond && attempts.length === 1) {
              clearTimeout(hedgeTimer)
              launch(otherRoute(route), 'failover')
              return
            }
            // 另一条线路仍在进行，继续等它
            if (live.size > 0) return
            decided = attempt
            settle('superseded', abortedBySibling(), () => reject(error))
          }

          const onSuccess = (data: T) => {
            clearTimeout(timer)
            if (settled) return
            // 超时中止与响应同时到达时，以超时为准
            if (timedOut) return onFailure(controller.signal.reason)
            close(attempt)
            const body = data as { success?: boolean; errorCode?: number } | null
            const businessFailed = body?.success === false || Boolean(body?.errorCode)
            attempt.http_status = 200
            attempt.result = businessFailed ? 'failed' : 'success'
            if (businessFailed) attempt.error_code = 'business_error'
            // HTTP 200 的业务失败交给原 API adapter，不切线路、不改变业务返回契约。
            decided = attempt
            settle('superseded', abortedBySibling(), () => resolve(data))
          }

          // 同步调用 send：调用方随后立即取消时，至少已经发出首个尝试，与旧行为一致
          let pending: Promise<T>
          try {
            pending = send(route, controller.signal)
          } catch (error) {
            pending = Promise.reject(error)
          }
          pending.then(onSuccess, onFailure)
        }

        launch(first, 'initial')
        if (allowSecond) {
          hedgeTimer = setTimeout(() => {
            if (settled || attempts.length > 1) return
            hedged = true
            launch(otherRoute(first), 'hedge')
          }, hedgeDelayMs(endpoint))
        }
      })
    } catch (error) {
      if (cancelled || external?.aborted) cancelled = true
      else {
        terminalError = error
        if (typeof error === 'object' && error !== null) failedRequests.add(error)
      }
      throw error
    } finally {
      const decisive = decided ?? attempts.at(-1)
      const result: ApiRequestResult['result'] = cancelled
        ? 'cancelled'
        : decided?.result === 'success'
          ? 'success'
          : 'failed'
      const responded = !cancelled && decided?.http_status === 200
      const recovered =
        result === 'success' && primaryFailed && decided !== undefined && decided.route !== first
      if (recovered) this.safely(() => this.observer?.recovered(primaryError))
      // 只有同时比较过两条线路、且一条给出了有效响应，才算学到了东西
      if (responded && decided) {
        if (attempts.length > 1) {
          this.learn(decided.route, revision, primaryFailed ? 'failover' : 'hedge', requestId)
        } else if (decided.result === 'success') {
          this.refresh(decided.route, revision)
        }
      }
      const summary: ApiRequestResult = {
        request_id: requestId,
        operation_id: control?.operationId,
        endpoint,
        mode,
        first_route: first,
        first_route_source: firstSource,
        final_route: decisive?.route ?? first,
        result,
        attempt_count: attempts.length,
        duration_ms: Math.round(performance.now() - started),
        recovered,
        hedged,
        attempts,
        http_status: decisive?.http_status,
        error_code: decisive?.error_code,
      }
      this.safely(() => this.observer?.completed(summary))
      if (result === 'failed' && terminalError) {
        this.safely(() => this.observer?.failed(terminalError, summary))
      }
    }
  }
}

/** 另一条线路已经决定了本轮结果时，取消仍在进行的尝试 */
const abortedBySibling = () => new DOMException('另一条线路已返回', 'AbortError')
