import type { ErrorContext } from './contracts'
import { telemetry } from './client'

type Capture = (error: unknown, context: ErrorContext) => string | undefined

const objectErrors = new WeakSet<object>()
const primitiveErrors = new Set<string>()
const MAX_PRIMITIVE_KEYS = 100

const primitiveKey = (error: unknown, context: ErrorContext): string =>
  `${context.mechanism ?? 'unknown'}:${context.errorCode ?? ''}:${String(error)}`

export const captureExceptionOnce = (
  error: unknown,
  context: ErrorContext,
  capture: Capture = telemetry.captureException,
): string | undefined => {
  if ((typeof error === 'object' && error !== null) || typeof error === 'function') {
    const object = error as object
    if (objectErrors.has(object)) return undefined
    objectErrors.add(object)
  } else {
    const key = primitiveKey(error, context)
    if (primitiveErrors.has(key)) return undefined
    if (primitiveErrors.size >= MAX_PRIMITIVE_KEYS) primitiveErrors.clear()
    primitiveErrors.add(key)
  }

  return capture(error, context)
}
