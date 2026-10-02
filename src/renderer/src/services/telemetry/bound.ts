export interface BoundTelemetryOptions {
  maxDepth?: number
  maxStringLength?: number
  maxArrayLength?: number
  maxObjectKeys?: number
}

export interface BoundedTelemetryValue {
  value: unknown
  truncated: boolean
}

/**
 * 只限制体积并消除循环引用，避免 payload 被 413 拒收或序列化卡死。
 * 这里刻意不做任何脱敏：按产品决定完整保留 URL、路径、token 等诊断上下文。
 */
export const boundTelemetryString = (value: string, maxLength = 8_192): BoundedTelemetryValue =>
  value.length <= maxLength
    ? { value, truncated: false }
    : { value: `${value.slice(0, maxLength)}…[Truncated]`, truncated: true }

export const boundTelemetryValue = (
  input: unknown,
  options: BoundTelemetryOptions = {},
): BoundedTelemetryValue => {
  const maxDepth = options.maxDepth ?? 6
  const maxStringLength = options.maxStringLength ?? 8_192
  const maxArrayLength = options.maxArrayLength ?? 50
  const maxObjectKeys = options.maxObjectKeys ?? 100
  const seen = new WeakSet<object>()
  let truncated = false

  const visit = (value: unknown, depth: number): unknown => {
    if (typeof value === 'string') {
      const bounded = boundTelemetryString(value, maxStringLength)
      truncated ||= bounded.truncated
      return bounded.value
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
      entries.slice(0, maxObjectKeys).map(([key, item]) => [key, visit(item, depth + 1)]),
    )
  }

  return { value: visit(input, 0), truncated }
}
