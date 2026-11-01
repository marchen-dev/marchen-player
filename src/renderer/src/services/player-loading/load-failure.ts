import type { ErrorState } from '@marchen/player-loading'
import type { MediaSourceErrorCode } from '@marchen/shared/media-sources'
import { isMediaSourceErrorCode, MEDIA_SOURCE_ERROR_MESSAGES } from '@marchen/shared/media-sources'

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

/** 重试无效、需要到媒体源页面重新登录或检查配置的错误 */
const OPEN_SOURCE_TITLES: Partial<Record<MediaSourceErrorCode, string>> = {
  auth_failed: '媒体源需要重新登录',
  forbidden: '没有访问权限',
  source_removed: '媒体源已被移除',
  not_found: '找不到这个视频',
}

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
      title: '无法打开视频链接',
      description: '链接可能已失效，请重试或更换链接',
      // Web 端没有网络视频能力，只能返回
      actions: isWeb ? [] : ['retry', 'change_link'],
    }
  }

  return {
    title: '无法打开视频文件',
    description: '文件可能已被移动、删除或无法读取',
    actions: ['reselect'],
  }
}

function describeProviderFailure(code: string | undefined, isWeb: boolean): LoadFailureView {
  // 媒体源只在桌面端提供，Web 端既不能重试也没有媒体源页面
  if (!isMediaSourceErrorCode(code)) {
    return {
      title: '无法连接媒体源',
      description: '请检查服务器是否在线后重试',
      actions: isWeb ? [] : ['retry'],
    }
  }

  const description = MEDIA_SOURCE_ERROR_MESSAGES[code]
  const openSourceTitle = OPEN_SOURCE_TITLES[code]
  if (openSourceTitle) {
    return { title: openSourceTitle, description, actions: isWeb ? [] : ['open_source'] }
  }
  if (UNRECOVERABLE.has(code)) {
    return { title: '无法播放此媒体源视频', description, actions: [] }
  }
  return {
    title:
      code === 'unreachable' || code === 'invalid_response'
        ? '无法连接媒体源'
        : '无法打开媒体源视频',
    description,
    actions: isWeb ? [] : ['retry'],
  }
}
