export type CompatibilityFallbackClass =
  'browser-decode' | 'producer-or-mse-compatibility' | 'terminal'

export interface CompatibilityFallbackErrorLike {
  code: string
  stage?: string
}

/**
 * 只有能证明当前媒体形态与 Chromium/MSE 不兼容的错误才可以升级 attempt。
 * 文件、权限、磁盘、网络、取消和单纯慢都是终止错误。
 */
export const classifyCompatibilityFallback = (
  error: CompatibilityFallbackErrorLike,
): CompatibilityFallbackClass => {
  if (error.code === 'decode' || error.code === 'not-supported' || error.code === 'decode-failed') {
    return 'browser-decode'
  }
  if (
    error.code === 'mse-attach-failed' ||
    error.code === 'manifest-invalid' ||
    (error.code === 'generation-failed' &&
      (error.stage === 'mse' || error.stage === 'manifest-validation'))
  ) {
    return 'producer-or-mse-compatibility'
  }
  return 'terminal'
}

export const isCompatibilityFallbackEligible = (error: CompatibilityFallbackErrorLike): boolean =>
  classifyCompatibilityFallback(error) !== 'terminal'
