import type { MediaSourceErrorCode } from '@marchen/shared/media-sources'
import { MediaSourceError } from '@marchen/shared/media-sources'
import { RemoteMediaError } from '@marchen/shared/media/remote'

const CERTIFICATE_CODES = new Set([
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
])

/**
 * 只有 401 代表凭证失效；403 是账号有效但没有这一项的权限（例如 WebDAV 的某个子目录），
 * 不能据此把整个来源标记为需要重新登录。
 */
export const errorForStatus = (status: number): MediaSourceError =>
  new MediaSourceError(
    status === 401
      ? 'auth_failed'
      : status === 403
        ? 'forbidden'
        : status === 404
          ? 'not_found'
          : 'invalid_response',
  )

/** 统一把 provider、fetch、范围读取抛出的异常映射为稳定错误码，原始信息保留在 message 之外的 cause。 */
export function toMediaSourceError(error: unknown): MediaSourceError {
  if (error instanceof MediaSourceError) return error
  if (error instanceof RemoteMediaError) {
    const code: MediaSourceErrorCode =
      error.code === 'range'
        ? 'range_unsupported'
        : error.code === 'changed'
          ? 'content_changed'
          : error.code === 'unsupported'
            ? 'invalid_input'
            : 'unreachable'
    return withCause(new MediaSourceError(code), error)
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError')
      return withCause(new MediaSourceError('unreachable'), error)
    const cause = (error as { cause?: { code?: unknown } }).cause
    const code = typeof cause?.code === 'string' ? cause.code : undefined
    if (code && CERTIFICATE_CODES.has(code))
      return withCause(new MediaSourceError('certificate'), error)
    // undici 网络失败统一抛 TypeError('fetch failed')，具体原因在 cause 中
    if (error instanceof TypeError) return withCause(new MediaSourceError('unreachable'), error)
  }
  return withCause(new MediaSourceError('invalid_response'), error)
}

const withCause = (target: MediaSourceError, cause: unknown) => {
  Object.defineProperty(target, 'cause', { value: cause, enumerable: false })
  return target
}
