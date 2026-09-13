const tail = (value: string, limit: number) =>
  value.length <= limit ? value : `…[Truncated]${value.slice(-limit)}`

/** 详细命令、路径和 stderr 只进入 Sentry issue context，不进入标签或产品事件。 */
export const getMainErrorDiagnosticContext = (error: unknown): Record<string, unknown> => {
  if (!error || typeof error !== 'object') return {}
  const value = error as Record<string, unknown>
  const arguments_ = Array.isArray(value.arguments)
    ? value.arguments.filter((item): item is string => typeof item === 'string').slice(0, 200)
    : []
  const inputs = Array.isArray(value.inputs)
    ? value.inputs.filter((item): item is string => typeof item === 'string').slice(0, 20)
    : []
  return {
    ...(typeof value.executable === 'string'
      ? { command: tail([value.executable, ...arguments_].join(' '), 16_384) }
      : {}),
    ...(inputs.length > 0 ? { input_paths: inputs.map((item) => tail(item, 2_048)) } : {}),
    ...(typeof value.stderr === 'string' ? { stderr: tail(value.stderr, 32_768) } : {}),
    ...(typeof value.durationMs === 'number' ? { duration_ms: value.durationMs } : {}),
  }
}
