/** 多处共用的通用词。只收真正跨模块复用的，模块专属的文案放各自的命名空间 */
export default {
  action: {
    cancel: '取消',
    clear: '清除',
    close: '关闭',
    confirm: '确认',
    copy: '复制',
    done: '完成',
    retry: '重试',
  },
  /** 复制到剪贴板失败时的提示 */
  copyFailed: '复制失败',
} as const
