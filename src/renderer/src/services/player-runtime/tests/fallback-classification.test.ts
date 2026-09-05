import { describe, expect, it } from 'vitest'
import { classifyCompatibilityFallback } from '../fallback-classification'

describe('compatibility fallback 分类', () => {
  it.each([
    [{ code: 'decode' }, 'browser-decode'],
    [{ code: 'not-supported' }, 'browser-decode'],
    [{ code: 'decode-failed', stage: 'decode' }, 'browser-decode'],
    [{ code: 'mse-attach-failed', stage: 'mse' }, 'producer-or-mse-compatibility'],
    [{ code: 'manifest-invalid', stage: 'manifest-validation' }, 'producer-or-mse-compatibility'],
    [{ code: 'generation-failed', stage: 'manifest-validation' }, 'producer-or-mse-compatibility'],
  ] as const)('%o 允许进入下一个 attempt', (error, expected) => {
    expect(classifyCompatibilityFallback(error)).toBe(expected)
  })

  it.each([
    'source-unavailable',
    'source-changed',
    'disk-space-low',
    'cache-budget-exceeded',
    'cancelled',
    'gateway-unavailable',
    'startup-deadline-exceeded',
    'network',
    'aborted',
  ])('%s 必须终止当前 logical source', (code) => {
    expect(classifyCompatibilityFallback({ code })).toBe('terminal')
  })
})
