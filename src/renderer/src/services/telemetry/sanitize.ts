export interface SanitizeTelemetryOptions {
  maxDepth?: number
  maxStringLength?: number
  maxArrayLength?: number
  maxObjectKeys?: number
}

export interface SanitizedTelemetryValue {
  value: unknown
  truncated: boolean
}

const SECRET_KEY = /^(?:api[_-]?key|authorization|cookie|set-cookie|password|secret|token)$/i
const GATEWAY_TOKEN = /(https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/v1\/media\/)[^/\s?#]+/gi

export const sanitizeTelemetryString = (
  value: string,
  maxLength = 8_192,
): SanitizedTelemetryValue => {
  const withoutGatewayToken = value.replace(GATEWAY_TOKEN, '$1[Filtered]')
  if (withoutGatewayToken.length <= maxLength) {
    return { value: withoutGatewayToken, truncated: false }
  }
  return {
    value: `${withoutGatewayToken.slice(0, maxLength)}…[Truncated]`,
    truncated: true,
  }
}

export const sanitizeTelemetryValue = (
  input: unknown,
  options: SanitizeTelemetryOptions = {},
): SanitizedTelemetryValue => {
  const maxDepth = options.maxDepth ?? 6
  const maxStringLength = options.maxStringLength ?? 8_192
  const maxArrayLength = options.maxArrayLength ?? 50
  const maxObjectKeys = options.maxObjectKeys ?? 100
  const seen = new WeakSet<object>()
  let truncated = false

  const visit = (value: unknown, depth: number): unknown => {
    if (typeof value === 'string') {
      const sanitized = sanitizeTelemetryString(value, maxStringLength)
      truncated ||= sanitized.truncated
      return sanitized.value
    }
    if (
      value == null ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return typeof value === 'bigint' ? value.toString() : value
    }
    if (typeof value === 'function' || typeof value === 'symbol') return String(value)
    if (depth >= maxDepth) {
      truncated = true
      return '[MaxDepth]'
    }
    if (value instanceof Error) {
      return {
        name: value.name,
        message: visit(value.message, depth + 1),
        stack: visit(value.stack, depth + 1),
        cause: visit(value.cause, depth + 1),
      }
    }
    if (typeof value !== 'object') return value
    if (seen.has(value)) {
      truncated = true
      return '[Circular]'
    }
    seen.add(value)

    if (Array.isArray(value)) {
      if (value.length > maxArrayLength) truncated = true
      return value.slice(0, maxArrayLength).map((item) => visit(item, depth + 1))
    }

    const entries = Object.entries(value)
    if (entries.length > maxObjectKeys) truncated = true
    return Object.fromEntries(
      entries.slice(0, maxObjectKeys).map(([key, item]) => [
        key,
        SECRET_KEY.test(key) ? '[Filtered]' : visit(item, depth + 1),
      ]),
    )
  }

  return { value: visit(input, 0), truncated }
}
