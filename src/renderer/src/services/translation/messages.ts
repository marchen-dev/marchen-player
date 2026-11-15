/**
 * 弹幕翻译的全部界面文案。
 *
 * 本功能新增的文字集中放在这一个文件里，组件与服务不各自写字符串：
 * 后续做界面多语言时，只需要把这里替换成翻译函数即可。
 */
import type { TranslationTarget } from './assets/manifest'
import type { DanmakuTranslationStatus } from './status'
import type { TranslationUnsupportedReason } from './support'

/** 首次下载的大致体积（gzip 后），仅用于确认提示 */
const APPROXIMATE_DOWNLOAD_SIZE = '50 MB'

const UNSUPPORTED_REASON: Record<TranslationUnsupportedReason, string> = {
  not_configured: '当前版本未提供翻译资源',
  no_wasm_simd: '当前浏览器不支持所需的 WebAssembly 特性',
  no_worker: '当前环境不支持后台线程',
  no_decompression: '当前浏览器版本过旧，无法解压翻译资源',
  no_storage: '当前环境无法保存翻译资源',
}

const DOWNLOAD_FAILURE: Record<
  Extract<DanmakuTranslationStatus, { state: 'download_failed' }>['code'],
  string
> = {
  assets_network: '下载失败，请检查网络',
  assets_http: '下载失败，资源暂时不可用',
  assets_integrity: '下载的文件校验未通过',
  assets_storage: '保存失败，可能是磁盘空间不足',
  assets_aborted: '下载已取消',
}

const percent = (loaded: number, total: number) =>
  total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : 0

export const translationMessages = {
  settingTitle: '弹幕翻译',
  /** 下拉框选项：「不翻译」与各目标语言。语言名用该语言自己的写法，看不懂中文的用户也能认出 */
  offOption: '不翻译',
  targetOptions: { en: 'English' } satisfies Record<TranslationTarget, string>,
  retry: '重试',

  /** 设置行副标题；不需要副标题时返回 null */
  status(status: DanmakuTranslationStatus): string | null {
    switch (status.state) {
      case 'unsupported':
        return UNSUPPORTED_REASON[status.reason]
      case 'off':
        // 未开启时不显示副标题：下拉框选中的「不翻译」已经说明了状态
        return null
      case 'confirming':
        return '等待确认下载'
      case 'downloading':
        return `正在下载翻译资源 ${percent(status.loaded, status.total)}%`
      case 'download_failed':
        return DOWNLOAD_FAILURE[status.code]
      case 'ready':
        return '已开启'
      case 'starting':
        return '正在加载翻译引擎'
      case 'translating':
        return `本集翻译中 ${status.done} / ${status.total}`
      case 'done':
        return `本集已翻译 ${status.total} 条`
      case 'engine_failed':
        return '翻译引擎出错，弹幕按原文显示'
    }
  },

  confirm: {
    title: '下载翻译资源',
    description: `弹幕翻译在本机完成，首次使用需要下载翻译引擎与模型（约 ${APPROXIMATE_DOWNLOAD_SIZE}）。下载后离线可用，可随时在「通用」设置中清除。`,
    confirm: '下载并开启',
    cancel: '取消',
  },

  /** 悬停工具条里原文行的无障碍说明 */
  hoverOriginalLabel: '原文',

  storage: {
    label: '翻译模型',
    description: '弹幕翻译使用的引擎与模型；清除后弹幕翻译会关闭',
  },
} as const
