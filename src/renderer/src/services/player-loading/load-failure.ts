import type { ErrorState } from '@marchen/player-loading'
import type { MediaSourceErrorCode } from '@marchen/shared/media-sources'
import { isMediaSourceErrorCode } from '@marchen/shared/media-sources'
import { t } from '@renderer/lib/i18n'

/**
 * 加载失败（导入或识别阶段出错）时的文案与可用操作。
 *
 * 底层错误只作为诊断详情；界面按来源给出用户能理解的原因和下一步。
 * 媒体源带稳定错误码，可以区分「重试能解决」与「需要去媒体源处理」。
 */

/** 第一个是主操作；「返回」由界面固定追加，不在此列 */
export type LoadFailureAction = 'retry' | 'change_link' | 'reselect' | 'open_source'

export interface LoadFailureView {
  title: string
  description: string
  actions: LoadFailureAction[]
}

/**
 * 重试无效、需要到媒体源页面重新登录或检查配置的错误。
 * 标题在取用时按错误码查 `player:loadFailure.provider.titles.<错误码>`，不放在模块顶层的常量里。
 */
const OPEN_SOURCE_CODES = ['auth_failed', 'forbidden', 'source_removed', 'not_found'] as const
type OpenSourceCode = (typeof OPEN_SOURCE_CODES)[number]
const isOpenSourceCode = (code: MediaSourceErrorCode): code is OpenSourceCode =>
  (OPEN_SOURCE_CODES as readonly string[]).includes(code)

/** 服务器能力或证书问题，重试与重新登录都无法解决 */
const UNRECOVERABLE = new Set<MediaSourceErrorCode>([
  'certificate',
  'unsupported_version',
  'range_unsupported',
])

export function describeLoadFailure(state: ErrorState, isWeb: boolean): LoadFailureView {
  if (state.providerRequest) return describeProviderFailure(state.error.code, isWeb)

  if (state.remoteRequest) {
    return {
      title: t('player:loadFailure.remote.title'),
      description: t('player:loadFailure.remote.description'),
      // Web 端没有网络视频能力，只能返回
      actions: isWeb ? [] : ['retry', 'change_link'],
    }
  }

  return {
    title: t('player:loadFailure.local.title'),
    description: t('player:loadFailure.local.description'),
    actions: ['reselect'],
  }
}

function describeProviderFailure(code: string | undefined, isWeb: boolean): LoadFailureView {
  // 媒体源只在桌面端提供，Web 端既不能重试也没有媒体源页面
  if (!isMediaSourceErrorCode(code)) {
    return {
      title: t('player:loadFailure.provider.unreachableTitle'),
      description: t('player:loadFailure.provider.unreachableDescription'),
      actions: isWeb ? [] : ['retry'],
    }
  }

  const description = t(`errors:mediaSource.${code}`)
  if (isOpenSourceCode(code)) {
    return {
      title: t(`player:loadFailure.provider.titles.${code}`),
      description,
      actions: isWeb ? [] : ['open_source'],
    }
  }
  if (UNRECOVERABLE.has(code)) {
    return { title: t('player:loadFailure.provider.unplayableTitle'), description, actions: [] }
  }
  return {
    title:
      code === 'unreachable' || code === 'invalid_response'
        ? t('player:loadFailure.provider.unreachableTitle')
        : t('player:loadFailure.provider.openFailedTitle'),
    description,
    actions: isWeb ? [] : ['retry'],
  }
}
