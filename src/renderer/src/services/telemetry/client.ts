import type {
  CommonTelemetryProperties,
  ErrorContext,
  TelemetryBreadcrumb,
  TelemetryClient,
  TelemetryEventMap,
  TelemetryEventName,
  TelemetryIdentity,
  TelemetrySpan,
} from './contracts'

export const createNoopTelemetryClient = (): TelemetryClient => ({
  identify: () => {},
  capture: () => {},
  captureException: () => undefined,
  log: () => {},
  addBreadcrumb: () => {},
  startSpan: (_span, run) => run(),
  flush: async () => {},
  reset: async () => {},
})

export const createCompositeTelemetryClient = (
  clients: readonly TelemetryClient[],
): TelemetryClient => ({
  identify: (identity) => clients.forEach((item) => item.identify(identity)),
  capture: (name, properties) => clients.forEach((item) => item.capture(name, properties)),
  captureException(error, context) {
    let eventId: string | undefined
    for (const item of clients) eventId ??= item.captureException(error, context)
    return eventId
  },
  log: (entry) => clients.forEach((item) => item.log(entry)),
  addBreadcrumb: (breadcrumb) => clients.forEach((item) => item.addBreadcrumb(breadcrumb)),
  // 业务回调只能执行一次；组合 client 以首个供应商作为 tracing owner。
  // 初始化顺序固定为 Sentry、PostHog，因此不会创建重复 span，也不会吞掉 Sentry span。
  startSpan: (span, run) => clients[0]?.startSpan(span, run) ?? run(),
  async flush() {
    await Promise.allSettled(clients.map((item) => item.flush()))
  },
  async reset() {
    await Promise.allSettled(clients.map((item) => item.reset()))
  },
})

let client: TelemetryClient = createNoopTelemetryClient()
let contextProvider: () => CommonTelemetryProperties

export const configureTelemetry = (options: {
  client?: TelemetryClient
  contextProvider: () => CommonTelemetryProperties
}) => {
  client = options.client ?? createNoopTelemetryClient()
  contextProvider = options.contextProvider
}

const safely = <T>(run: () => T, fallback: T): T => {
  try {
    return run()
  } catch (error) {
    console.warn('[telemetry] 遥测调用失败，已降级', error)
    return fallback
  }
}

export const telemetry = {
  identify(identity: TelemetryIdentity) {
    safely(() => client.identify(identity), undefined)
  },
  capture<E extends TelemetryEventName>(name: E, properties: TelemetryEventMap[E]) {
    safely(() => client.capture(name, { ...contextProvider(), ...properties }), undefined)
  },
  captureException(error: unknown, context?: ErrorContext): string | undefined {
    return safely(() => client.captureException(error, context), undefined)
  },
  log(entry: Parameters<TelemetryClient['log']>[0]) {
    safely(() => client.log(entry), undefined)
  },
  addBreadcrumb(breadcrumb: TelemetryBreadcrumb) {
    safely(() => client.addBreadcrumb(breadcrumb), undefined)
  },
  startSpan<T>(span: TelemetrySpan, run: () => T | Promise<T>): T | Promise<T> {
    try {
      return client.startSpan(span, run)
    } catch (error) {
      console.warn('[telemetry] span 初始化失败，业务继续执行', error)
      return run()
    }
  },
  async flush(): Promise<void> {
    await safely(() => client.flush(), Promise.resolve())
  },
  async reset(): Promise<void> {
    await safely(() => client.reset(), Promise.resolve())
  },
}
